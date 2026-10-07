import { appendFileSync, mkdirSync } from "node:fs";
import { dirname } from "node:path";

export function captureBuurtstallingenMail(input: {
  to: string;
  cc?: string | null;
  subject: string;
  html: string;
}): void {
  const path = process.env.BUURTSTALLINGEN_MAIL_CAPTURE;
  if (!path) return;
  mkdirSync(dirname(path), { recursive: true });
  appendFileSync(
    path,
    `${JSON.stringify({
      at: new Date().toISOString(),
      to: input.to,
      cc: input.cc ?? null,
      subject: input.subject,
      html: input.html,
    })}\n`,
  );
}
