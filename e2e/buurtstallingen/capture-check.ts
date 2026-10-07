import { loadLocalEnv } from "./env";
import { citizen } from "./fixture";

async function main(): Promise<void> {
  loadLocalEnv();
  for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]) {
    delete process.env[key];
  }
  const { sendBuurtstallingenMail } = await import("../../src/modules/buurtstallingen/application/mail");
  await sendBuurtstallingenMail({
    to: citizen.email,
    subject: "e2e capture",
    html: "<p>e2e</p>",
  });
}

void main();
