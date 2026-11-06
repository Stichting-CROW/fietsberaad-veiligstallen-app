import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  assertNoOverlapWithExisting,
  buildBulkWindow,
  bulkHoldsOverlap,
  BULK_ERROR_OVERLAP,
  dateRangesOverlap,
  exceptionMatchesBulkWeekday,
  nextRollForwardState,
  recurrentAppliesOnDay,
  startOfLocalDay,
  BulkValidationError,
} from "./domain";

describe("dateRangesOverlap", () => {
  it("detects overlapping intervals", () => {
    const a0 = new Date(2026, 0, 1, 9, 0);
    const a1 = new Date(2026, 0, 1, 17, 0);
    const b0 = new Date(2026, 0, 1, 16, 0);
    const b1 = new Date(2026, 0, 1, 18, 0);
    assert.equal(dateRangesOverlap(a0, a1, b0, b1), true);
    assert.equal(dateRangesOverlap(a0, a1, new Date(2026, 0, 1, 18, 0), new Date(2026, 0, 1, 19, 0)), false);
  });
});

describe("buildBulkWindow", () => {
  it("extends end to next day when end clock is before start", () => {
    const day = new Date(2026, 5, 10);
    const { start, end } = buildBulkWindow(day, "22:00", "06:00");
    assert.equal(start.getHours(), 22);
    assert.equal(end.getDate(), 11);
    assert.equal(end.getHours(), 6);
  });
});

describe("bulkHoldsOverlap", () => {
  it("weekly holds on same weekday with overlapping times overlap", () => {
    const a = {
      sectieId: 1,
      recurrent: true,
      start: new Date(2026, 0, 5, 8, 0),
      end: new Date(2026, 0, 5, 12, 0),
    };
    const b = {
      sectieId: 1,
      recurrent: true,
      start: new Date(2026, 0, 12, 10, 0),
      end: new Date(2026, 0, 12, 14, 0),
    };
    assert.equal(bulkHoldsOverlap(a, b), true);
  });

  it("one-off today does not overlap weekly hold starting next week (same weekday)", () => {
    const oneOff = {
      sectieId: 1,
      recurrent: false,
      start: new Date(2026, 9, 14, 8, 0),
      end: new Date(2026, 9, 14, 12, 0),
    };
    const weekly = {
      sectieId: 1,
      recurrent: true,
      start: new Date(2026, 9, 21, 8, 0),
      end: new Date(2026, 9, 21, 12, 0),
    };
    assert.equal(bulkHoldsOverlap(oneOff, weekly), false);
  });

  it("one-off on occurrence day overlaps weekly hold", () => {
    const oneOff = {
      sectieId: 1,
      recurrent: false,
      start: new Date(2026, 9, 21, 9, 0),
      end: new Date(2026, 9, 21, 13, 0),
    };
    const weekly = {
      sectieId: 1,
      recurrent: true,
      start: new Date(2026, 9, 21, 8, 0),
      end: new Date(2026, 9, 21, 12, 0),
    };
    assert.equal(bulkHoldsOverlap(oneOff, weekly), true);
  });

  it("weekly holds on different weekdays do not overlap", () => {
    const a = {
      sectieId: 1,
      recurrent: true,
      start: new Date(2026, 0, 5, 8, 0),
      end: new Date(2026, 0, 5, 12, 0),
    };
    const b = {
      sectieId: 1,
      recurrent: true,
      start: new Date(2026, 0, 6, 8, 0),
      end: new Date(2026, 0, 6, 12, 0),
    };
    assert.equal(bulkHoldsOverlap(a, b), false);
  });
});

describe("assertNoOverlapWithExisting", () => {
  it("throws when one-off ranges overlap", () => {
    const candidate = {
      sectieId: 1,
      recurrent: false,
      start: new Date(2026, 0, 10, 9, 0),
      end: new Date(2026, 0, 10, 17, 0),
    };
    const existing = [
      {
        id: 1,
        sectieId: 1,
        recurrent: false,
        start: new Date(2026, 0, 10, 16, 0),
        end: new Date(2026, 0, 10, 18, 0),
      },
    ];
    assert.throws(
      () => assertNoOverlapWithExisting(candidate, existing),
      (err: unknown) => err instanceof BulkValidationError && err.message === BULK_ERROR_OVERLAP
    );
  });
});

describe("recurrentAppliesOnDay", () => {
  it("is false before the first weekly occurrence", () => {
    const start = new Date(2026, 9, 21, 8, 0);
    assert.equal(recurrentAppliesOnDay(start, new Date(2026, 9, 14)), false);
    assert.equal(recurrentAppliesOnDay(start, new Date(2026, 9, 21)), true);
  });
});

describe("exceptionMatchesBulkWeekday", () => {
  it("requires same weekday as bulk start", () => {
    const bulkStart = new Date(2026, 0, 5, 8, 0);
    assert.equal(exceptionMatchesBulkWeekday(bulkStart, new Date(2026, 0, 12)), true);
    assert.equal(exceptionMatchesBulkWeekday(bulkStart, new Date(2026, 0, 6)), false);
  });
});

describe("nextRollForwardState", () => {
  it("returns null when end is today or later", () => {
    const today = new Date(2026, 9, 14);
    const start = new Date(2026, 9, 14, 6, 0);
    const end = new Date(2026, 9, 14, 22, 0);
    assert.equal(nextRollForwardState(start, end, today), null);
  });

  it("shifts one week when end date is before today", () => {
    const today = startOfLocalDay(new Date(2026, 9, 14));
    const start = new Date(2026, 9, 6, 6, 0);
    const end = new Date(2026, 9, 6, 22, 0);
    const step = nextRollForwardState(start, end, today);
    assert.ok(step);
    assert.equal(step.start.getDate(), 13);
    assert.equal(step.end.getDate(), 13);
  });
});
