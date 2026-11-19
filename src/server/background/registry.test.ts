import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { scheduleDefaults } from "./registry";

const enabledKeys = (env: Record<string, string>) =>
  scheduleDefaults(env).filter((s) => s.enabled).map((s) => s.key);

describe("scheduleDefaults", () => {
  it("seeds every schedule disabled on deployed builds", () => {
    assert.deepEqual(enabledKeys({ NODE_ENV: "production" }), []);
    assert.deepEqual(enabledKeys({ NODE_ENV: "production", NEXT_PUBLIC_APP_ENV: "acceptance" }), []);
    assert.deepEqual(enabledKeys({ NODE_ENV: "production", NEXT_PUBLIC_APP_ENV: "production" }), []);
    assert.deepEqual(enabledKeys({}), []);
  });

  it("keeps the per-task defaults under next dev", () => {
    const keys = enabledKeys({ NODE_ENV: "development" });
    assert.ok(keys.includes("process-queues"));
    assert.ok(!keys.includes("privacy-retention"));
    assert.ok(!keys.includes("info-files"));
  });

  it("still lists every schedule", () => {
    assert.equal(scheduleDefaults({ NODE_ENV: "production" }).length, scheduleDefaults({ NODE_ENV: "development" }).length);
  });
});
