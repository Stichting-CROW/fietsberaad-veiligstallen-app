import assert from "node:assert/strict";
import test from "node:test";
import { assertTargetDatabase, TestEnvError } from "./guard";
import { fakeEmail, stableToken, transformRow } from "./anonymize";

const local = "mysql://veiligstallen:secret@127.0.0.1:5556/acc_docker";
const prod = "mysql://readonly:secret@127.0.0.1:5557/veiligstallen";

test("target host must be local and not the production server", () => {
  process.env.TEST_ENV_BOOTSTRAP = "1";
  process.env.NEXT_PUBLIC_APP_ENV = "acceptance";
  assert.equal(assertTargetDatabase(local, prod).database, "acc_docker");
  assert.throws(() => assertTargetDatabase("mysql://u:p@127.0.0.1:5555/veiligstallen", prod), TestEnvError);
  assert.throws(() => assertTargetDatabase("mysql://u:p@vst-eu-prd-msql02.mysql.database.azure.com:3306/acc_docker", prod), TestEnvError);
  assert.throws(() => assertTargetDatabase("mysql://u:p@veiligstallen.work:3306/acc_docker", prod), TestEnvError);
  assert.throws(() => assertTargetDatabase(local, "mysql://u:p@127.0.0.1:5556/veiligstallen"), TestEnvError);
});

test("bootstrap stays off without the flag and on production", () => {
  process.env.TEST_ENV_BOOTSTRAP = "0";
  process.env.NEXT_PUBLIC_APP_ENV = "acceptance";
  assert.throws(() => assertTargetDatabase(local), TestEnvError);
  process.env.TEST_ENV_BOOTSTRAP = "1";
  process.env.NEXT_PUBLIC_APP_ENV = "production";
  assert.throws(() => assertTargetDatabase(local), TestEnvError);
});

test("anonymized pass ids are stable and emails do not keep the source address", () => {
  const token = stableToken("ABC-123");
  assert.equal(stableToken("ABC-123"), token);
  assert.equal(fakeEmail("user", "1").endsWith("@example.test"), true);
  const row = transformRow("accounts", {
    ID: "1",
    Email: "real@gemeente.nl",
    FirstName: "Anna",
    LastName: "Jansen",
    Phone: "0612345678",
    EncryptedPassword: "old",
  }, { passwordHash: "hash", passwordApi: "API" });
  assert.equal(row.Email, "user-" + stableToken("1", 10) + "@example.test");
  assert.equal(row.Phone, null);
  assert.equal(row.EncryptedPassword, "hash");
  const pas = transformRow("transacties", { PasID: "ABC-123" }, { passwordHash: "hash", passwordApi: "API" });
  assert.equal(pas.PasID, token.slice(0, 32));
  const org = transformRow("contacts", {
    ID: "9",
    ItemType: "organizations",
    CompanyName: "Gemeente Voorbeeld",
    FirstName: "Piet",
    Email1: "piet@gemeente.nl",
  }, { passwordHash: "hash", passwordApi: "API" });
  assert.equal(org.CompanyName, "Gemeente Voorbeeld");
  assert.equal(org.FirstName, null);
});
