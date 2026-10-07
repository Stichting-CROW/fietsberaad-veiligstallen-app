import assert from "node:assert/strict";
import test from "node:test";
import { bikeTypeFromStored, bikeTypeToStored } from "./types";

test("slot tables count bike types from 0 and FMS ids count from 1", () => {
  assert.equal(bikeTypeFromStored(0), 1);
  assert.equal(bikeTypeFromStored(1), 2);
  assert.equal(bikeTypeFromStored(12), 13);
  assert.equal(bikeTypeFromStored(null), null);
  assert.equal(bikeTypeFromStored(undefined), null);
  assert.equal(bikeTypeToStored(1), 0);
  assert.equal(bikeTypeToStored(13), 12);
});
