import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { slide2QueryString, type ResolvedPresentationQuery } from "./fms-display-resolve";

describe("slide2QueryString", () => {
  it("keeps CF siteID + bikeparkID contract", () => {
    const q = slide2QueryString({
      siteId: "F9B67832-B1C5-7EDA-D7CA5CB83C0E30A1",
      bikeparkIdFromUrl: "546F265B-3287-A9C2-69ACEAED1EDCC41E",
    });
    assert.match(q, /siteID=F9B67832/);
    assert.match(q, /bikeparkID=546F265B/);
  });

  it("uses FMS citycode + locationId when provided", () => {
    const resolved: ResolvedPresentationQuery = {
      siteId: "internal-only",
      fmsCitycode: "9933",
      fmsLocationId: "9933_001",
    };
    const q = slide2QueryString(resolved);
    assert.equal(q, "citycode=9933&locationId=9933_001");
    assert.doesNotMatch(q, /siteID=/);
  });
});
