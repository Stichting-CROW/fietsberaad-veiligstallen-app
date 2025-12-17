import type { NextApiRequest, NextApiResponse } from "next";
import nodemailer from "nodemailer";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { env } from "~/env.mjs";

type MailResponse =
  | { ok: true; messageId: string | null; accepted: string[]; rejected: string[] }
  | { ok: false; error: string };

type MailRequestBody = {
  to?: string;
  subject?: string;
  text?: string;
};

function formatFrom(fromEmailOrHeader: string) {
  // If SMTP_FROM already contains a display name (e.g. "Name <email@x>"), keep it as-is.
  if (fromEmailOrHeader.includes("<") && fromEmailOrHeader.includes(">")) return fromEmailOrHeader;
  return `VeiligStallen <${fromEmailOrHeader}>`;
}

function requireSmtpConfig() {
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

export default async function handler(req: NextApiRequest, res: NextApiResponse<MailResponse>) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "Method Not Allowed" });
    return;
  }

  const { to, subject, text } = (req.body ?? {}) as MailRequestBody;
  if (!to || !subject || !text) {
    res.status(400).json({ ok: false, error: "Missing required fields: to, subject, text" });
    return;
  }

  const cfg = requireSmtpConfig();
  if (!cfg.ok) {
    res.status(500).json({ ok: false, error: cfg.error });
    return;
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: env.SMTP_SECURE ?? cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
  });

  const info = await transporter.sendMail({
    from: formatFrom(cfg.from),
    to,
    subject,
    text,
    replyTo: session.user.email ?? undefined,
  });

  res.status(200).json({
    ok: true,
    messageId: info.messageId ?? null,
    accepted: (info.accepted ?? []).map(String),
    rejected: (info.rejected ?? []).map(String),
  });
}


