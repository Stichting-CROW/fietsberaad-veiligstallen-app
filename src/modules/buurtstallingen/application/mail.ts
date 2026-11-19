import { createMailer, formatFrom, requireSmtpConfig } from "~/utils/server/mail-tools";
import { captureBuurtstallingenMail } from "./mail-capture";

export async function sendBuurtstallingenMail(input: {
  to: string;
  cc?: string | null;
  subject: string;
  html: string;
}): Promise<void> {
  captureBuurtstallingenMail(input);
  const cfg = requireSmtpConfig();
  if (!cfg.ok) {
    console.error("Buurtstallingen mail niet verstuurd:", cfg.error);
    return;
  }
  const transporter = createMailer(cfg);
  await transporter.sendMail({
    from: formatFrom(cfg.from),
    replyTo: cfg.replyTo,
    to: input.to,
    cc: input.cc || undefined,
    subject: input.subject,
    html: input.html,
  });
}

export async function sendOpsMail(subject: string, html: string): Promise<void> {
  const to = process.env.BUURTSTALLINGEN_OPS_EMAIL;
  if (!to) return;
  await sendBuurtstallingenMail({ to, subject, html });
}
