import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { verifyPasswordSetupToken } from "~/utils/server/password-setup-token";

type ValidateResponse =
  | { ok: true; user: { name: string; email: string } }
  | { ok: false; error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<ValidateResponse>) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ ok: false, error: "Method Not Allowed" });
    return;
  }

  const token = (req.body?.token as string | undefined) ?? "";
  const verified = verifyPasswordSetupToken(token);
  if ("error" in verified) {
    res.status(400).json({ ok: false, error: verified.error });
    return;
  }

  // Ensure the user still exists and matches the token.
  const user = await prisma.security_users.findFirst({
    where: { UserID: verified.uid },
    select: { UserName: true, DisplayName: true },
  });

  if (!user?.UserName || user.UserName !== verified.email) {
    res.status(400).json({ ok: false, error: "Invalid token" });
    return;
  }

  res.status(200).json({
    ok: true,
    user: { name: user.DisplayName ?? verified.name ?? "", email: user.UserName },
  });
}


