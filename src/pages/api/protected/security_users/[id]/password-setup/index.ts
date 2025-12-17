import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { z } from "zod";
import { env } from "~/env.mjs";
import { prisma } from "~/server/db";
import { validateUserSession } from "~/utils/server/database-tools";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { createMailer, formatFrom, requireSmtpConfig } from "~/utils/server/mail-tools";
import { createPasswordSetupToken } from "~/utils/server/password-setup-token";

type PasswordSetupRequestResponse =
  | { ok: true }
  | { ok: false; error: string };

const bodySchema = z.object({
  // Optional override to send to a different address; defaults to user's UserName.
  to: z.string().email().optional(),
});

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<PasswordSetupRequestResponse>,
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ ok: false, error: "Unauthorized" });
    return;
  }

  const validate = await validateUserSession(session, "any");
  if ("error" in validate) {
    res.status(401).json({ ok: false, error: validate.error });
    return;
  }

  if (
    !userHasRight(session.user.securityProfile, VSSecurityTopic.gebruikers_dataeigenaar_admin) &&
    !userHasRight(session.user.securityProfile, VSSecurityTopic.gebruikers_dataeigenaar_beperkt)
  ) {
    res.status(403).json({ ok: false, error: "Geen toegang" });
    return;
  }

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "Method Not Allowed" });
    return;
  }

  const id = req.query.id as string;
  const parsed = bodySchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Invalid request body" });
    return;
  }

  const user = await prisma.security_users.findFirst({
    where: { UserID: id },
    select: { UserID: true, UserName: true, DisplayName: true, Status: true },
  });

  if (!user?.UserID || !user.UserName) {
    res.status(404).json({ ok: false, error: "User not found" });
    return;
  }

  const to = parsed.data.to ?? user.UserName;
  const name = user.DisplayName ?? "";

  // 24h token lifetime
  const token = createPasswordSetupToken(
    { uid: user.UserID, email: user.UserName, name },
    60 * 60 * 24,
  );

  const setupUrl = `${env.NEXTAUTH_URL.replace(/\/$/, "")}/wachtwoord-instellen?token=${encodeURIComponent(token)}`;

  const subject = "Stel je wachtwoord in voor VeiligStallen";
  const initiatorName = session.user.name ?? "";
  const initiatorEmail = session.user.email ?? "";

  const text = `Hallo ${name || "gebruiker"},

Via de volgende link kun je een nieuw wachtwoord instellen voor VeiligStallen:

${setupUrl}

Met vriendelijke groet,

${initiatorName}
${initiatorEmail}`;

  const html = `
    <p>Hallo ${name || "gebruiker"},</p>
    <p>Via de volgende link kun je een nieuw wachtwoord instellen voor VeiligStallen:</p>
    <p>
      <a
        href="${setupUrl}"
        style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600"
      >
        Stel wachtwoord in
      </a>
    </p>
    <p>Met vriendelijke groet,</p>
    <p>${initiatorName}<br/>${initiatorEmail}</p>
  `;

  const cfg = requireSmtpConfig();
  if (!cfg.ok) {
    res.status(500).json({ ok: false, error: cfg.error });
    return;
  }

  const transporter = createMailer(cfg);
  await transporter.sendMail({
    from: formatFrom(cfg.from),
    to,
    subject,
    text,
    html,
    replyTo: session.user.email ?? undefined,
  });

  res.status(200).json({ ok: true });
}


