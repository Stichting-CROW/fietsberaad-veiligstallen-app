/**
 * One UPDATE with a different value per id. Column names are fixed identifiers, values are parameters.
 * Later rows for the same id win. A column omitted on a row keeps that row's current value.
 */

type SqlExecutor = {
  $executeRawUnsafe: (query: string, ...values: unknown[]) => Promise<unknown>;
};

function assertIdent(name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) {
    throw new Error(`Ongeldige kolomnaam: ${name}`);
  }
  return name;
}

export async function updateRowsById(
  db: SqlExecutor,
  table: string,
  idColumn: string,
  rows: { id: string | number; set: Record<string, unknown> }[],
  shared?: Record<string, unknown>
): Promise<void> {
  if (rows.length === 0) return;
  const tableName = assertIdent(table);
  const idName = assertIdent(idColumn);

  const collapsed = new Map<string | number, Record<string, unknown>>();
  for (const row of rows) {
    const prev = collapsed.get(row.id) ?? {};
    collapsed.set(row.id, { ...prev, ...row.set });
  }
  const items = [...collapsed.entries()].map(([id, set]) => ({ id, set }));
  if (items.length === 0) return;

  const columns = [...new Set(items.flatMap((item) => Object.keys(item.set)))];
  const assignments: string[] = [];
  const params: unknown[] = [];

  for (const column of columns) {
    const name = assertIdent(column);
    const setters = items.filter((item) => Object.prototype.hasOwnProperty.call(item.set, column));
    if (setters.length === 0) continue;
    const whens = setters.map(() => "WHEN ? THEN ?").join(" ");
    assignments.push(`\`${name}\` = CASE \`${idName}\` ${whens} ELSE \`${name}\` END`);
    for (const item of setters) {
      params.push(item.id, item.set[column]);
    }
  }

  for (const [column, value] of Object.entries(shared ?? {})) {
    assignments.push(`\`${assertIdent(column)}\` = ?`);
    params.push(value);
  }
  if (assignments.length === 0) return;

  const inList = items.map(() => "?").join(", ");
  params.push(...items.map((item) => item.id));
  await db.$executeRawUnsafe(
    `UPDATE \`${tableName}\` SET ${assignments.join(", ")} WHERE \`${idName}\` IN (${inList})`,
    ...params
  );
}
