import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  formatOverzichtenFreePlaces,
  formatPublicFreePlaces,
} from "./display-rules";

describe("formatPublicFreePlaces", () => {
  it("returns X when closed", () => {
    assert.deepEqual(formatPublicFreePlaces({ open: false, capacity: 100, occupation: 10, occupied: 10, bulkbezetting: 0 }), { kind: "x" });
  });

  it("returns VOL when occupied/capacity > 0.95", () => {
    assert.deepEqual(formatPublicFreePlaces({ open: true, capacity: 100, occupation: 90, occupied: 96, bulkbezetting: 0 }), { kind: "vol", full: true });
  });

  it("returns free as capacity - occupied", () => {
    assert.deepEqual(formatPublicFreePlaces({ open: true, capacity: 100, occupation: 50, occupied: 50, bulkbezetting: 0 }), { kind: "number", value: 50, full: false });
  });
});

describe("formatOverzichtenFreePlaces", () => {
  it("uses 0.90 threshold and subtracts bulk", () => {
    assert.deepEqual(formatOverzichtenFreePlaces({ open: true, capacity: 100, occupation: 91, occupied: 91, bulkbezetting: 0 }), { kind: "vol", full: true });
    assert.deepEqual(formatOverzichtenFreePlaces({ open: true, capacity: 100, occupation: 50, occupied: 55, bulkbezetting: 5 }), { kind: "number", value: 45, full: false });
  });
});
