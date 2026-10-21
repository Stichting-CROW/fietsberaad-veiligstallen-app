import assert from "node:assert/strict";
import test from "node:test";
import { sectionTotalCapacity, storedBikeTypeCapacity } from "./section-capacity";

test("disallowed bike type capacity is stored as 0", () => {
  assert.equal(storedBikeTypeCapacity(119, false), 0);
  assert.equal(storedBikeTypeCapacity(108, true), 108);
  assert.equal(storedBikeTypeCapacity(null, true), 0);
});

test("section capacity is the sum of bike type capacities", () => {
  assert.equal(sectionTotalCapacity([108, 0, 11, 0]), 119);
  assert.equal(sectionTotalCapacity([null, undefined]), 0);
});
