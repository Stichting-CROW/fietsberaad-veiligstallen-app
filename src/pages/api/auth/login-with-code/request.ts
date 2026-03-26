import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "~/server/db";
import { createMailer, formatFrom, requireSmtpConfig } from "~/utils/server/mail-tools";

const REQUEST_SCHEMA = z.object({
  email: z.string().email(),
});

function createSixDigitCode(): string {
  return `${Math.floor(100000 + Math.random() * 900000)}`;
}

function createCodeHash(email: string, code: string): string | null {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.LOGINTOKEN_SIGNER_PRIVATE_KEY;
  if (!secret) return null;
  return crypto.createHash("sha256").update(`${email.toLowerCase()}:${code}:${secret}`).digest("hex");
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ ok?: boolean; error?: string }>
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const parsed = REQUEST_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const user = await prisma.security_users.findFirst({
    where: { UserName: email },
    select: { UserID: true, UserName: true },
  });

  // Prevent account enumeration. Always return success to the client.
  if (!user?.UserName) {
    res.status(200).json({ ok: true });
    return;
  }

  const code = createSixDigitCode();
  const hash = createCodeHash(email, code);
  if (!hash) {
    res.status(500).json({ error: "Missing auth secret configuration" });
    return;
  }

  const expires = new Date(Date.now() + 15 * 60 * 1000);

  await prisma.verificationToken.deleteMany({
    where: { identifier: email },
  });

  await prisma.verificationToken.create({
    data: {
      identifier: email,
      token: `login-with-code:${hash}`,
      expires,
    },
  });

  const cfg = requireSmtpConfig();
  if (!cfg.ok) {
    res.status(500).json({ error: cfg.error });
    return;
  }

  const transporter = createMailer(cfg);
  try {
    await transporter.sendMail({
      from: formatFrom(cfg.from),
      to: email,
      subject: "Je inlogcode voor VeiligStallen",
      html: `<p>Gebruik deze code om in te loggen:</p><p style="font-size:24px;font-weight:700;letter-spacing:4px">${code}</p><p>Deze code is 15 minuten geldig.</p>`,
      text: `Gebruik deze code om in te loggen: ${code}. Deze code is 15 minuten geldig.`,
    });
  } catch (error) {
    console.error("login-with-code request mail error:", error);
    res.status(500).json({ error: "Failed to send login code" });
    return;
  }

  res.status(200).json({ ok: true });
}
