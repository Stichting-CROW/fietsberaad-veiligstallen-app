import assert from "node:assert/strict";
import test from "node:test";
import { generateUniqueSectionExternalId, nextSectionExternalId } from "./section-external-id";

test("first section is unpadded _1", () => {
  assert.equal(nextSectionExternalId("2600_066", null), "2600_066_1");
  assert.equal(nextSectionExternalId("2600_066", ""), "2600_066_1");
});

test("suffix after the last underscore is incremented without padding", () => {
  assert.equal(nextSectionExternalId("2600_066", "2600_066_1"), "2600_066_2");
  assert.equal(nextSectionExternalId("2600_066", "2600_066_001"), "2600_066_2");
  assert.equal(nextSectionExternalId("2600_066", "2600_066_9"), "2600_066_10");
});

test("a non-numeric suffix falls back to _1", () => {
  assert.equal(nextSectionExternalId("2600_066", "2600_066_K"), "2600_066_1");
});

test("generation uses the string max from sections and transactions", async () => {
  const calls: string[] = [];
  const queryRaw = async (sql: string) => {
    calls.push(sql);
    if (sql.includes("MAX(externalId)")) {
      return [{ externalId: "2600_066_4" }];
    }
    return [];
  };
  const id = await generateUniqueSectionExternalId(queryRaw, "uuid", "2600_066");
  assert.equal(id, "2600_066_5");
  assert.match(calls[0] ?? "", /isKluis = 0/);
  assert.match(calls[0] ?? "", /NOT LIKE '%K%'/);
});

test("an id already stored on a locker section is skipped", async () => {
  const queryRaw = async (sql: string, ...values: unknown[]) => {
    if (sql.includes("MAX(externalId)")) return [{ externalId: null }];
    return values[0] === "2600_066_1" ? [{ externalId: "2600_066_1" }] : [];
  };
  const id = await generateUniqueSectionExternalId(queryRaw, "uuid", "2600_066");
  assert.equal(id, "2600_066_2");
});
