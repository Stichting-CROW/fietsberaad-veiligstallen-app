import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { decideInternalTick } from "./internal-tick";

const dev = (DATABASE_URL: string, extra: Record<string, string> = {}) => ({ NODE_ENV: "development", DATABASE_URL, ...extra });

describe("decideInternalTick", () => {
  it("is on in dev with a local docker database", () => {
    assert.equal(decideInternalTick(dev("mysql://u:p@127.0.0.1:5556/acc_docker")).enabled, true);
    assert.equal(decideInternalTick(dev("mysql://u:p@localhost:3306/db")).enabled, true);
    assert.equal(decideInternalTick(dev("mysql://u:p@mysql:3306/acc_docker")).enabled, true);
  });

  it("is off in dev through the SSH tunnel port", () => {
    assert.equal(decideInternalTick(dev("mysql://u:p@127.0.0.1:5555/veiligstallen")).enabled, false);
    assert.equal(
      decideInternalTick(dev("mysql://u:p@127.0.0.1:6000/db", { BACKGROUND_TUNNEL_PORTS: "6000" })).enabled,
      false,
    );
  });

  it("is off in dev with a remote database host", () => {
    assert.equal(decideInternalTick(dev("mysql://u:p@db.example.azure.com:3306/db")).enabled, false);
  });

  it("is off outside dev unless forced", () => {
    assert.equal(decideInternalTick({ NODE_ENV: "production", DATABASE_URL: "mysql://u:p@127.0.0.1/db" }).enabled, false);
    assert.equal(decideInternalTick({ NODE_ENV: "production", BACKGROUND_INTERNAL_TICK: "true" }).enabled, true);
  });

  it("lets an explicit false win in dev", () => {
    assert.equal(decideInternalTick(dev("mysql://u:p@127.0.0.1:5556/db", { BACKGROUND_INTERNAL_TICK: "false" })).enabled, false);
  });
});
