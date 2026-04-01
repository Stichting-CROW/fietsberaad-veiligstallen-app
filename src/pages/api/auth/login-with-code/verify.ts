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

function verifyStatelessCode(email: string, code: string, now = Date.now()): boolean {
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.LOGINTOKEN_SIGNER_PRIVATE_KEY;
  if (!secret) return false;

  // 15 minute validity window: current bucket + 2 previous 5 minute buckets.
  const currentBucket = Math.floor(now / (5 * 60 * 1000));
  for (let i = 0; i <= 2; i += 1) {
    const bucket = currentBucket - i;
    const digest = crypto
      .createHmac("sha256", secret)
      .update(`${email.toLowerCase()}:${bucket}`)
      .digest();
    const value = digest.readUInt32BE(0) % 1_000_000;
    const candidate = `${value}`.padStart(6, "0");
    if (candidate === code) return true;
  }
  return false;
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

  let hasDbToken = false;
  try {
    const tokenRow = await prisma.verificationToken.findFirst({
      where: {
        identifier: email,
        token: `login-with-code:${hash}`,
        expires: { gt: new Date() },
      },
      select: { token: true },
    });
    hasDbToken = Boolean(tokenRow);
  } catch (error) {
    console.error("login-with-code verify db read failed, trying stateless fallback:", error);
  }

  const hasStatelessMatch = verifyStatelessCode(email, parsed.data.code);
  if (!hasDbToken && !hasStatelessMatch) {
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

  if (hasDbToken) {
    try {
      await prisma.verificationToken.deleteMany({
        where: { identifier: email },
      });
    } catch (error) {
      console.error("login-with-code verify db cleanup failed:", error);
    }
  }

  const loginToken = calculateAuthToken(user.UserID);
  if (!loginToken) {
    res.status(500).json({ error: "Kon geen login token maken" });
    return;
  }

  res.status(200).json({ ok: true, userid: user.UserID, token: loginToken.token });
}
