import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import { env } from "~/env.mjs";
import { prisma } from "~/server/db";
import { createMailer, formatFrom, requireSmtpConfig } from "~/utils/server/mail-tools";
import { createPasswordSetupToken } from "~/utils/server/password-setup-token";

type PasswordResetRequestResponse =
  | { ok: true }
  | { ok: false; error: string };

const bodySchema = z.object({
  email: z.string().email(),
});

function getBaseUrl(req: NextApiRequest) {
  const proto =
    (req.headers["x-forwarded-proto"] as string | undefined)?.split(",")[0]?.trim() ??
    (env.NEXTAUTH_URL.startsWith("https://") ? "https" : "http");
  const host =
    (req.headers["x-forwarded-host"] as string | undefined)?.split(",")[0]?.trim() ??
    req.headers.host ??
    "";
  if (!host) return env.NEXTAUTH_URL.replace(/\/$/, "");
  return `${proto}://${host}`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PasswordResetRequestResponse>,
) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "Method Not Allowed" });
    return;
  }

  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Ongeldig e-mailadres" });
    return;
  }

  // Look up user by email (UserName field in security_users)
  const user = await prisma.security_users.findFirst({
    where: { UserName: parsed.data.email },
    select: { UserID: true, UserName: true, DisplayName: true, Status: true },
  });

  // For security reasons, don't reveal whether the user exists or not
  // Always return success to prevent email enumeration
  if (!user?.UserID || !user.UserName) {
    // Still return success to prevent email enumeration attacks
    res.status(200).json({ ok: true });
    return;
  }

  // Check if user is active
  if (user.Status !== "1") {
    // Still return success to prevent email enumeration
    res.status(200).json({ ok: true });
    return;
  }

  const name = user.DisplayName ?? "";

  // 24h token lifetime
  const token = createPasswordSetupToken(
    { uid: user.UserID, email: user.UserName, name },
    60 * 60 * 24,
  );

  const setupUrl = `${getBaseUrl(req)}/wachtwoord-instellen?token=${encodeURIComponent(token)}`;

  const subject = "Stel je wachtwoord in voor VeiligStallen";

  const text = `Hallo ${name || "gebruiker"},

Je hebt aangevraagd om je wachtwoord opnieuw in te stellen voor VeiligStallen.

Via de volgende link kun je een nieuw wachtwoord instellen:

${setupUrl}

Deze link is 24 uur geldig.

Als je deze aanvraag niet hebt gedaan, kun je deze e-mail negeren.

Met vriendelijke groet,

VeiligStallen`;

  const html = `
    <p>Hallo ${name || "gebruiker"},</p>
    <p>Je hebt aangevraagd om je wachtwoord opnieuw in te stellen voor VeiligStallen.</p>
    <p>Via de volgende link kun je een nieuw wachtwoord instellen:</p>
    <p>
      <a
        href="${setupUrl}"
        style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600"
      >
        Stel wachtwoord in
      </a>
    </p>
    <p>Deze link is 24 uur geldig.</p>
    <p>Als je deze aanvraag niet hebt gedaan, kun je deze e-mail negeren.</p>
    <p>Met vriendelijke groet,<br/>VeiligStallen</p>
  `;

  const cfg = requireSmtpConfig();
  if (!cfg.ok) {
    res.status(500).json({ ok: false, error: cfg.error });
    return;
  }

  const transporter = createMailer(cfg);
  await transporter.sendMail({
    from: formatFrom(cfg.from),
    to: user.UserName,
    subject,
    text,
    html,
  });

  res.status(200).json({ ok: true });
}

