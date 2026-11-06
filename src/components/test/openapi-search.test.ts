import assert from "node:assert/strict";
import test from "node:test";
import reportingSpec from "~/lib/openapi/reporting-api-v4.json";
import fmsSpec from "~/lib/openapi/fms-api-v4.json";
import { searchOpenApi, type OpenApiDocument } from "./openapi-search";

const reporting = reportingSpec as OpenApiDocument;
const fms = fmsSpec as OpenApiDocument;

test("checkintype finds the reporting transaction schema and endpoint", () => {
  const result = searchOpenApi(reporting, "checkintype");
  const titles = result.hits.map((hit) => hit.title);
  assert.ok(titles.includes("TransactionRow.checkintype"));
  assert.ok(titles.includes("TransactionDefaults.checkintype"));
  assert.ok(titles.some((title) => title.includes("/transactions")));
  assert.equal(result.spec.components?.schemas?.TransactionRow != null, true);
  assert.equal(result.spec.components?.schemas?.GeoPoint, undefined);
});

test("bakfiets finds the bike type field", () => {
  const result = searchOpenApi(reporting, "bakfiets");
  assert.ok(result.hits.some((hit) => hit.title === "TransactionRow.biketypeid"));
});

test("fms checkintype finds the managed transaction schema", () => {
  const result = searchOpenApi(fms, "CheckInType");
  assert.ok(result.hits.some((hit) => hit.title === "V3ManagedTransaction.checkintype"));
});

test("a blank query leaves the document intact", () => {
  const result = searchOpenApi(reporting, " ");
  assert.equal(result.hits.length, 0);
  assert.equal(result.spec, reporting);
});
