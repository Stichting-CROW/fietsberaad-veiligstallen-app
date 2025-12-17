import nodemailer from "nodemailer";
import { env } from "~/env.mjs";

export function formatFrom(fromEmailOrHeader: string) {
  // If SMTP_FROM already contains a display name (e.g. "Name <email@x>"), keep it as-is.
  if (fromEmailOrHeader.includes("<") && fromEmailOrHeader.includes(">")) return fromEmailOrHeader;
  return `VeiligStallen <${fromEmailOrHeader}>`;
}

export function requireSmtpConfig() {
  const host = env.SMTP_HOST;
  const port = env.SMTP_PORT;
  const user = env.SMTP_USER;
  const pass = env.SMTP_PASS;
  const from = env.SMTP_FROM ?? user;

  if (!host || !port || !user || !pass || !from) {
    return {
      ok: false as const,
      error:
        "Missing SMTP env vars. Required: SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM (or SMTP_USER as fallback).",
    };
  }

  return { ok: true as const, host, port, user, pass, from };
}

export function createMailer(cfg: { host: string; port: number; user: string; pass: string }) {
  return nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: env.SMTP_SECURE ?? cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });
}


