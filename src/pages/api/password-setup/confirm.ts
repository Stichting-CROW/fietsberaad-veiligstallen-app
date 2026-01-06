import type { NextApiRequest, NextApiResponse } from "next";
import { z } from "zod";
import bcrypt from "bcryptjs";
import { prisma } from "~/server/db";
import { verifyPasswordSetupToken } from "~/utils/server/password-setup-token";

type ConfirmResponse =
  | { ok: true }
  | { ok: false; error: string };

const bodySchema = z.object({
  token: z.string().min(1),
  password: z.string().min(8),
});

const saltRounds = 13;

export default async function handler(req: NextApiRequest, res: NextApiResponse<ConfirmResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "Method Not Allowed" });
    return;
  }

  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ ok: false, error: "Invalid request" });
    return;
  }

  const verified = verifyPasswordSetupToken(parsed.data.token);
  if ("error" in verified) {
    res.status(400).json({ ok: false, error: verified.error });
    return;
  }

  // Ensure the user still exists and matches the token.
  const user = await prisma.security_users.findFirst({
    where: { UserID: verified.uid },
    select: { UserID: true, UserName: true },
  });

  if (!user?.UserID || !user.UserName || user.UserName !== verified.email) {
    res.status(400).json({ ok: false, error: "Invalid token" });
    return;
  }

  const hashedpassword = await bcrypt.hash(parsed.data.password, saltRounds);
  await prisma.security_users.update({
    where: { UserID: user.UserID },
    data: { EncryptedPassword: hashedpassword, EncryptedPassword2: hashedpassword },
  });

  res.status(200).json({ ok: true });
}


