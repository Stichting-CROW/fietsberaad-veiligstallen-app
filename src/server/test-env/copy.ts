import type { Connection, RowDataPacket } from "mysql2/promise";
import { transformRow, type Anonymizer } from "./anonymize";

const IDENT = /^[A-Za-z0-9_]+$/;
const SPATIAL = new Set(["geometry", "point", "multipoint", "linestring", "polygon", "multipolygon", "geomcollection"]);
const CHUNK = 200;

export type CopyWarning = { table: string; message: string };

type ColumnInfo = { name: string; dataType: string; extra: string };

function assertIdent(name: string): string {
  if (!IDENT.test(name)) throw new Error(`Ongeldige SQL-naam: ${name}`);
  return `\`${name}\``;
}

function plain(row: RowDataPacket, columns: string[]): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const column of columns) out[column] = row[column];
  return out;
}

function sqlValue(value: unknown): unknown {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "bigint") return value.toString();
  if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
    const maybeDecimal = value as { toFixed?: () => string };
    if (typeof maybeDecimal.toFixed === "function" && !Array.isArray(value)) {
      return maybeDecimal.toFixed();
    }
    return JSON.stringify(value);
  }
  return value;
}

async function columnsOf(conn: Connection, table: string): Promise<ColumnInfo[] | null> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME AS name, DATA_TYPE AS dataType, EXTRA AS extra
     FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?
     ORDER BY ORDINAL_POSITION`,
    [table],
  );
  if (rows.length === 0) return null;
  return rows.map((row) => ({
    name: String(row.name),
    dataType: String(row.dataType).toLowerCase(),
    extra: String(row.extra ?? ""),
  }));
}

async function primaryKey(conn: Connection, table: string): Promise<string | null> {
  const [rows] = await conn.query<RowDataPacket[]>(
    `SELECT COLUMN_NAME AS name
     FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND CONSTRAINT_NAME = 'PRIMARY'
     ORDER BY ORDINAL_POSITION`,
    [table],
  );
  if (rows.length !== 1) return null;
  const name = String(rows[0]?.name ?? "");
  return IDENT.test(name) ? name : null;
}

export class TableCopier {
  readonly warnings: CopyWarning[] = [];
  readonly counts: Record<string, number> = {};

  constructor(
    private readonly source: Connection,
    private readonly target: Connection,
    private readonly anonymizer: Anonymizer,
    private readonly onStep: (step: string) => void,
  ) {}

  async prepareTarget(): Promise<void> {
    await this.target.query("SET FOREIGN_KEY_CHECKS=0");
    await this.target.query("SET SESSION sql_mode='ALLOW_INVALID_DATES,NO_ENGINE_SUBSTITUTION'");
    const [rows] = await this.target.query<RowDataPacket[]>(
      `SELECT TABLE_NAME AS name FROM information_schema.TABLES
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_TYPE = 'BASE TABLE'`,
    );
    for (const row of rows) {
      const name = String(row.name);
      if (!IDENT.test(name) || name === "_prisma_migrations") continue;
      try {
        await this.target.query(`TRUNCATE TABLE ${assertIdent(name)}`);
      } catch {
        await this.target.query(`DELETE FROM ${assertIdent(name)}`);
      }
    }
  }

  async copyAll(table: string): Promise<void> {
    await this.copyWhere(table, "1=1", []);
  }

  async copyWhere(table: string, whereSql: string, params: unknown[]): Promise<void> {
    this.onStep(table);
    if (!IDENT.test(table)) {
      this.warnings.push({ table, message: "Tabelnaam overgeslagen" });
      return;
    }
    const sourceColumns = await columnsOf(this.source, table);
    const targetColumns = await columnsOf(this.target, table);
    if (!sourceColumns || !targetColumns) {
      if (!this.warnings.some((warning) => warning.table === table)) {
        this.warnings.push({ table, message: "Tabel ontbreekt op bron of doel" });
      }
      this.counts[table] = this.counts[table] ?? 0;
      return;
    }
    const targetNames = new Set(targetColumns.map((column) => column.name));
    const columns = sourceColumns
      .filter((column) => targetNames.has(column.name))
      .filter((column) => !SPATIAL.has(column.dataType))
      .filter((column) => !column.extra.toLowerCase().includes("generated"))
      .map((column) => column.name)
      .filter((name) => IDENT.test(name));
    if (columns.length === 0) {
      this.warnings.push({ table, message: "Geen gemeenschappelijke kolommen" });
      this.counts[table] = 0;
      return;
    }

    const pk = await primaryKey(this.source, table);
    if (pk && whereSql !== "1=1" && !whereSql.startsWith(assertIdent(pk))) {
      await this.copyFilteredRows(table, columns, pk, whereSql, params);
      return;
    }
    let copied = 0;
    let lastPk: unknown = null;
    let offset = 0;
    const columnSql = columns.map(assertIdent).join(", ");
    for (;;) {
      const pkClause = pk && lastPk != null ? ` AND ${assertIdent(pk)} > ?` : "";
      const pageParams = pk && lastPk != null ? [...params, lastPk] : params;
      const distinct = pk ? "" : "DISTINCT ";
      const order = pk ? ` ORDER BY ${assertIdent(pk)}` : ` ORDER BY ${columnSql}`;
      const limit = pk ? ` LIMIT ${CHUNK}` : ` LIMIT ${CHUNK} OFFSET ${offset}`;
      const sql = `SELECT ${distinct}${columnSql} FROM ${assertIdent(table)} WHERE (${whereSql})${pkClause}${order}${limit}`;
      const [rows] = await this.source.query<RowDataPacket[]>(sql, pageParams);
      if (rows.length === 0) break;
      const prepared = rows.map((row) => transformRow(table, plain(row, columns), this.anonymizer));
      copied += await this.insertChunk(table, columns, prepared);
      if (pk) lastPk = rows[rows.length - 1]?.[pk];
      else offset += rows.length;
      if (rows.length < CHUNK) break;
      this.onStep(`${table} (${copied})`);
    }
    this.counts[table] = (this.counts[table] ?? 0) + copied;
  }

  /** One index scan for the filter, then primary-key lookups. Avoids ORDER BY pk on a filtered table. */
  private async copyFilteredRows(table: string, columns: string[], pk: string, whereSql: string, params: unknown[]): Promise<void> {
    const [idRows] = await this.source.query<RowDataPacket[]>(
      `SELECT ${assertIdent(pk)} AS pk FROM ${assertIdent(table)} WHERE (${whereSql})`,
      params,
    );
    const ids = idRows.map((row) => row.pk).filter((value) => value != null);
    const columnSql = columns.map(assertIdent).join(", ");
    let copied = 0;
    for (let index = 0; index < ids.length; index += CHUNK) {
      const chunk = ids.slice(index, index + CHUNK);
      const placeholders = chunk.map(() => "?").join(", ");
      const [rows] = await this.source.query<RowDataPacket[]>(
        `SELECT ${columnSql} FROM ${assertIdent(table)} WHERE ${assertIdent(pk)} IN (${placeholders})`,
        chunk,
      );
      const prepared = rows.map((row) => transformRow(table, plain(row, columns), this.anonymizer));
      copied += await this.insertChunk(table, columns, prepared);
      this.onStep(`${table} (${copied})`);
    }
    this.counts[table] = (this.counts[table] ?? 0) + copied;
  }

  /** Copy rows whose column is in values, in chunks. No-op when values is empty. */
  async copyIn(table: string, column: string, values: Array<string | number>, extraWhere = "", extraParams: unknown[] = []): Promise<void> {
    if (!IDENT.test(column) || values.length === 0) {
      this.counts[table] = this.counts[table] ?? 0;
      return;
    }
    for (let index = 0; index < values.length; index += 300) {
      const chunk = values.slice(index, index + 300);
      const placeholders = chunk.map(() => "?").join(", ");
      const extra = extraWhere ? ` AND (${extraWhere})` : "";
      await this.copyWhere(table, `${assertIdent(column)} IN (${placeholders})${extra}`, [...chunk, ...extraParams]);
    }
  }

  async values(sql: string, params: unknown[] = []): Promise<string[]> {
    const [rows] = await this.source.query<RowDataPacket[]>(sql, params);
    return rows
      .map((row) => Object.values(row)[0])
      .filter((value) => value != null && String(value) !== "")
      .map((value) => String(value));
  }

  async rows(sql: string, params: unknown[] = []): Promise<RowDataPacket[]> {
    const [found] = await this.source.query<RowDataPacket[]>(sql, params);
    return found;
  }

  private async insertChunk(table: string, columns: string[], rows: Record<string, unknown>[]): Promise<number> {
    try {
      await this.insertMany(table, columns, rows);
      return rows.length;
    } catch (error) {
      let copied = 0;
      for (const row of rows) {
        try {
          await this.insertMany(table, columns, [row]);
          copied += 1;
        } catch (rowError) {
          if (this.warnings.filter((warning) => warning.table === table).length < 8) {
            const message = rowError instanceof Error ? rowError.message : String(rowError);
            this.warnings.push({ table, message });
          }
        }
      }
      if (copied === 0 && rows.length > 0) {
        const message = error instanceof Error ? error.message : String(error);
        this.warnings.push({ table, message: `Chunk mislukt: ${message}` });
      }
      return copied;
    }
  }

  private async insertMany(table: string, columns: string[], rows: Record<string, unknown>[]): Promise<void> {
    const columnSql = columns.map(assertIdent).join(", ");
    const rowSql = `(${columns.map(() => "?").join(", ")})`;
    const values = rows.flatMap((row) => columns.map((column) => sqlValue(row[column])));
    await this.target.query(
      `INSERT INTO ${assertIdent(table)} (${columnSql}) VALUES ${rows.map(() => rowSql).join(", ")}`,
      values,
    );
  }
}
