import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { createMailer, formatFrom, requireSmtpConfig } from "~/utils/server/mail-tools";

type MailResponse =
  | { ok: true; messageId: string | null; accepted: string[]; rejected: string[] }
  | { ok: false; error: string };

type MailRequestBody = {
  to?: string;
  subject?: string;
  text?: string;
};

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

  const transporter = createMailer(cfg);

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


