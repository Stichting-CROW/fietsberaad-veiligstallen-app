import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { coldfusionUuid } from "./auth";

describe("coldfusionUuid", () => {
  it("matches CreateUUID length and grouping", () => {
    const id = coldfusionUuid();
    assert.equal(id.length, 35);
    assert.match(id, /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{16}$/);
  });
});
