import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ACTION_KEYS,
  CHUNK_SIZE,
  DELETE_ZERO_SALDO,
  MAX_CHUNK_SIZE,
  MONTHS_18,
  WRITE_CODE_LENGTH,
  YEARS_10,
  YEARS_7,
  RetentionGuardError,
  assertAsOf,
  assertFinish,
  assertRetentionSql,
  clampChunkSize,
  newWriteCode,
  parseRunBody,
  planAction,
} from "./retention-rules";

const asOf = new Date("2026-10-14T00:00:00Z");

function firstSql(statements: { sql: string }[]): string {
  const statement = statements[0];
  if (!statement) throw new Error("expected a statement");
  return statement.sql;
}

describe("retention SQL guards", () => {
  it("follows the queries that privacy.cfm runs by default", () => {
    assert.deepEqual(ACTION_KEYS, [
      "cleartransactions",
      "archive_financial",
      "clear_financial_transaction_id",
      "delete_prijswinnaars",
      "delete_prijswinnaars_backup",
    ]);

    for (const key of ACTION_KEYS) {
      const plan = planAction(key);
      const writes = plan.writes(asOf, ["id-1"]);
      assert.ok(writes.length > 0, key);
      for (const statement of writes) {
        assertRetentionSql(statement.sql, plan.required);
        assert.equal(statement.sql.includes("DROP"), false);
        assert.equal(statement.sql.includes("TRUNCATE"), false);
        assert.equal(statement.sql.includes("SHA1"), false);
      }
    }

    const remove = firstSql(planAction("cleartransactions").writes(asOf, [1]));
    assert.match(remove, /DELETE FROM transacties/);
    assert.match(remove, /Date_checkout </);
    assert.match(remove, new RegExp(`INTERVAL ${MONTHS_18} MONTH`));
    assert.equal(remove.includes("SHA1"), false);
    assert.equal(remove.includes(`INTERVAL ${YEARS_10} YEAR`), false);

    const archive = planAction("archive_financial");
    const archiveSql = archive.writes(asOf, ["f1"]).map((s) => s.sql).join("\n");
    assert.match(archiveSql, /historischesaldos/);
    assert.match(archiveSql, /<> '1'/);
    assert.match(archiveSql, /status = 'archived'/);
    assert.match(archiveSql, /ON DUPLICATE KEY UPDATE saldo = saldo \+ VALUES\(saldo\)/);
    assert.equal(archiveSql.includes("accountID IS NOT NULL"), false);
    const finish = archive.finish?.(asOf) ?? [];
    assertFinish(finish);
    assert.equal(finish[0]?.sql, DELETE_ZERO_SALDO);

    const seven = firstSql(planAction("clear_financial_transaction_id").writes(asOf, ["f1"]));
    assert.match(seven, new RegExp(`INTERVAL ${YEARS_7} YEAR`));
    assert.match(seven, /transactionID = NULL/);

    const prizes = firstSql(planAction("delete_prijswinnaars").writes(asOf, [1]));
    assert.match(prizes, /DELETE pw FROM prijswinnaars/);
    assert.match(prizes, new RegExp(`INTERVAL ${YEARS_10} YEAR`));
  });

  it("refuses a future clock, a short chunk, and a finish that is not the zero-balance delete", () => {
    assert.throws(() => assertAsOf(new Date("2099-01-01T00:00:00Z"), asOf), RetentionGuardError);
    assert.doesNotThrow(() => assertAsOf(asOf, asOf));
    assert.equal(clampChunkSize(1), 1);
    assert.equal(clampChunkSize(CHUNK_SIZE), CHUNK_SIZE);
    assert.equal(clampChunkSize(999999), MAX_CHUNK_SIZE);
    assert.throws(() => clampChunkSize(0), RetentionGuardError);
    assert.throws(
      () => assertRetentionSql("DELETE FROM transacties WHERE ID IN (?)", [`INTERVAL ${MONTHS_18} MONTH`]),
      /missing required predicate/,
    );
    assert.throws(() => assertRetentionSql("DROP TABLE transacties", ["INTERVAL 18 MONTH"]), /refused/);
    assert.throws(
      () => assertFinish([{ sql: "DELETE FROM historischesaldos", params: [] }]),
      /finish refused/,
    );
    assert.throws(
      () => assertFinish([{ sql: "DELETE FROM transacties WHERE saldo = 0", params: [] }]),
      /finish refused/,
    );
  });

  it("ignores cutoff overrides in the request body", () => {
    const parsed = parseRunBody({
      op: "start",
      mode: "write",
      confirm: "K7NP4R2Q",
      months: 1,
      years: 0,
      cutoff: "2099-01-01",
    });
    assert.equal(parsed.mode, "write");
    assert.equal(parsed.confirm, "K7NP4R2Q");
    assert.equal("months" in parsed, false);
    const sql = firstSql(planAction("cleartransactions").writes(asOf, [1]));
    assert.match(sql, /INTERVAL 18 MONTH/);
    assert.equal(sql.includes("INTERVAL 1 MONTH"), false);
    const code = newWriteCode();
    assert.equal(code.length, WRITE_CODE_LENGTH);
    assert.match(code, /^[ACEFHJKMNPRTWXY349]{6}$/);
    assert.equal(/[0OQDILBSZ28GUV]/.test(code), false);
  });
});
