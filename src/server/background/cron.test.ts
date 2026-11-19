import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describeCron, nextRunAfter, nextRuns, planSlot, validateCron } from "./cron";

const AMS = "Europe/Amsterdam";

describe("nextRunAfter", () => {
  it("keeps 03:30 local time across the summer-time switch", () => {
    assert.equal(nextRunAfter("30 3 * * *", AMS, new Date("2026-03-28T12:00:00Z"))?.toISOString(), "2026-03-29T01:30:00.000Z");
    assert.equal(nextRunAfter("30 3 * * *", AMS, new Date("2026-03-27T12:00:00Z"))?.toISOString(), "2026-03-28T02:30:00.000Z");
  });

  it("keeps 03:30 local time across the winter-time switch", () => {
    assert.equal(nextRunAfter("30 3 * * *", AMS, new Date("2026-10-24T12:00:00Z"))?.toISOString(), "2026-10-25T02:30:00.000Z");
    assert.equal(nextRunAfter("30 3 * * *", AMS, new Date("2026-10-23T12:00:00Z"))?.toISOString(), "2026-10-24T01:30:00.000Z");
  });

  it("supports other timezones", () => {
    assert.equal(nextRunAfter("0 3 * * *", "UTC", new Date("2026-06-01T00:00:00Z"))?.toISOString(), "2026-06-01T03:00:00.000Z");
  });

  it("returns several upcoming runs", () => {
    const runs = nextRuns("*/5 * * * *", AMS, 3, new Date("2026-06-01T10:01:00Z"));
    assert.deepEqual(runs.map((d) => d.toISOString()), [
      "2026-06-01T10:05:00.000Z",
      "2026-06-01T10:10:00.000Z",
      "2026-06-01T10:15:00.000Z",
    ]);
  });
});

describe("planSlot", () => {
  const now = new Date("2026-06-01T10:00:30Z");

  it("is not due before next_run_at", () => {
    assert.deepEqual(planSlot("* * * * *", AMS, new Date("2026-06-01T10:01:00Z"), now), { due: false });
  });

  it("collapses missed slots into one run and schedules after now", () => {
    const plan = planSlot("* * * * *", AMS, new Date("2026-06-01T09:00:00Z"), now);
    assert.equal(plan.due, true);
    if (!plan.due) return;
    assert.equal(plan.slot.toISOString(), "2026-06-01T09:00:00.000Z");
    assert.equal(plan.next?.toISOString(), "2026-06-01T10:01:00.000Z");
  });
});

describe("validateCron", () => {
  it("accepts five fields", () => {
    assert.equal(validateCron("15 4 * * *"), null);
  });

  it("rejects seconds and garbage", () => {
    assert.notEqual(validateCron("0 15 4 * * *"), null);
    assert.notEqual(validateCron("bad"), null);
    assert.notEqual(validateCron("61 * * * *"), null);
  });
});

describe("describeCron", () => {
  it("describes the common patterns in Dutch", () => {
    assert.equal(describeCron("* * * * *"), "elke minuut");
    assert.equal(describeCron("*/5 * * * *"), "elke 5 minuten");
    assert.equal(describeCron("2 4 * * *"), "dagelijks 04:02");
    assert.equal(describeCron("15 * * * *"), "elk uur om :15");
    assert.equal(describeCron("0 9 * * 1"), "0 9 * * 1");
  });
});
