import {
  type ActionKey,
  type RetentionMode,
  RetentionPostConditionError,
  assertAsOf,
  assertFinish,
  assertWrites,
  clampChunkSize,
  planAction,
} from "./retention-rules";

export type PrivacyDb = {
  query<T>(sql: string, params: unknown[]): Promise<T[]>;
  execute(sql: string, params: unknown[]): Promise<number>;
};

export type ChunkResult = {
  action: ActionKey;
  rowsMatched: number;
  rowsChanged: number;
  nextCursor: string | null;
  doneAction: boolean;
  logLine: string;
};

function idOf(row: { ID: unknown }): string {
  if (typeof row.ID === "bigint") return row.ID.toString();
  if (typeof row.ID === "number" || typeof row.ID === "string") return String(row.ID);
  throw new RetentionPostConditionError("unexpected id");
}

function freeze(row: Record<string, unknown> | undefined): string | null {
  if (!row) return null;
  const out: Record<string, string | null> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value == null) out[key] = null;
    else if (value instanceof Date) out[key] = value.toISOString();
    else if (typeof value === "bigint") out[key] = value.toString();
    else if (typeof value === "object") out[key] = String(value);
    else out[key] = String(value);
  }
  return JSON.stringify(out);
}

function countOf(row: { n: unknown } | undefined): number {
  if (!row) return 0;
  if (typeof row.n === "bigint") return Number(row.n);
  return Number(row.n ?? 0);
}

export async function executeActionChunk(
  db: PrivacyDb,
  action: ActionKey,
  cursor: string | null,
  asOf: Date,
  chunkSize: number,
  mode: RetentionMode,
  hooks?: { tamper?: (db: PrivacyDb) => Promise<void> },
): Promise<ChunkResult> {
  assertAsOf(asOf);
  const limit = clampChunkSize(chunkSize);
  const plan = planAction(action);
  if (mode === "dry-run") {
    const count = plan.count(asOf);
    const rows = await db.query<{ n: unknown }>(count.sql, count.params);
    const matched = countOf(rows[0]);
    return {
      action,
      rowsMatched: matched,
      rowsChanged: 0,
      nextCursor: null,
      doneAction: true,
      logLine: `${plan.heading}: simulatie, ${matched} kandidaten, geen schrijfactie`,
    };
  }

  const beforeRows = await db.query<Record<string, unknown>>(plan.survivor(asOf).sql, plan.survivor(asOf).params);
  const before = freeze(beforeRows[0]);

  const idQuery = plan.selectIds(asOf, cursor, limit);
  const selected = await db.query<{ ID: unknown }>(idQuery.sql, idQuery.params);
  const ids = selected.map((row) => row.ID);
  let changed = 0;
  if (ids.length > 0) {
    const writes = plan.writes(asOf, ids);
    assertWrites(action, writes);
    for (const statement of writes) {
      changed += await db.execute(statement.sql, statement.params);
    }
  }

  if (hooks?.tamper) await hooks.tamper(db);

  const afterRows = await db.query<Record<string, unknown>>(plan.survivor(asOf).sql, plan.survivor(asOf).params);
  const after = freeze(afterRows[0]);
  if (before !== null && before !== after) {
    throw new RetentionPostConditionError(
      `${action}: a row outside the retention window changed; the chunk was rolled back`,
    );
  }

  const lastRow = selected[selected.length - 1];
  const last = lastRow ? idOf(lastRow) : cursor;
  const doneAction = selected.length < limit;
  if (doneAction && plan.finish) {
    const finish = plan.finish(asOf);
    assertFinish(finish);
    for (const statement of finish) {
      changed += await db.execute(statement.sql, statement.params);
    }
  }
  return {
    action,
    rowsMatched: selected.length,
    rowsChanged: changed,
    nextCursor: doneAction ? null : last,
    doneAction,
    logLine: `${plan.heading}: ${changed} rijen gewijzigd, cursor ${last ?? "-"}`,
  };
}
