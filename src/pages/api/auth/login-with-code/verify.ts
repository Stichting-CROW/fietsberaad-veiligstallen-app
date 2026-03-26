import type { NextApiRequest, NextApiResponse } from "next";
import crypto from "crypto";
import { z } from "zod";
import { prisma } from "~/server/db";
import { calculateAuthToken } from "~/utils/token-tools";

const VERIFY_SCHEMA = z.object({
  email: z.string().email(),
  code: z.string().regex(/^\d{6}$/),
});

function createCodeHash(email: string, code: string): string | null {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.LOGINTOKEN_SIGNER_PRIVATE_KEY;
  if (!secret) return null;
  return crypto.createHash("sha256").update(`${email.toLowerCase()}:${code}:${secret}`).digest("hex");
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<{ ok?: boolean; userid?: string; token?: string; error?: string }>
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const parsed = VERIFY_SCHEMA.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const email = parsed.data.email.trim().toLowerCase();
  const hash = createCodeHash(email, parsed.data.code);
  if (!hash) {
    res.status(500).json({ error: "Missing auth secret configuration" });
    return;
  }

  const tokenRow = await prisma.verificationToken.findFirst({
    where: {
      identifier: email,
      token: `login-with-code:${hash}`,
      expires: { gt: new Date() },
    },
    select: { token: true },
  });

  if (!tokenRow) {
    res.status(401).json({ error: "Ongeldige of verlopen code" });
    return;
  }

  const user = await prisma.security_users.findFirst({
    where: { UserName: email },
    select: { UserID: true },
  });
  if (!user?.UserID) {
    res.status(401).json({ error: "Ongeldige gebruiker" });
    return;
  }

  await prisma.verificationToken.deleteMany({
    where: { identifier: email },
  });

  const loginToken = calculateAuthToken(user.UserID);
  if (!loginToken) {
    res.status(500).json({ error: "Kon geen login token maken" });
    return;
  }

  res.status(200).json({ ok: true, userid: user.UserID, token: loginToken.token });
}
