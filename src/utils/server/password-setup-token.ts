import crypto from "crypto";
import { env } from "~/env.mjs";

type PasswordSetupTokenPayload = {
  uid: string; // security_users.UserID
  email: string; // security_users.UserName
  name: string; // security_users.DisplayName
  exp: number; // unix seconds
};

function base64UrlEncode(input: string | Buffer) {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlDecodeToString(input: string) {
  const b64 = input.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((input.length + 3) % 4);
  return Buffer.from(b64, "base64").toString("utf8");
}

function sign(data: string) {
  return base64UrlEncode(crypto.createHmac("sha256", env.NEXTAUTH_SECRET).update(data).digest());
}

export function createPasswordSetupToken(payload: Omit<PasswordSetupTokenPayload, "exp">, ttlSeconds: number) {
  const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
  const fullPayload: PasswordSetupTokenPayload = { ...payload, exp };
  const b64 = base64UrlEncode(JSON.stringify(fullPayload));
  const sig = sign(b64);
  return `${b64}.${sig}`;
}

export function verifyPasswordSetupToken(token: string): PasswordSetupTokenPayload | { error: string } {
  const [b64, sig] = token.split(".");
  if (!b64 || !sig) return { error: "Invalid token" };

  const expected = sign(b64);
  const ok = crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(sig));
  if (!ok) return { error: "Invalid token" };

  let payload: PasswordSetupTokenPayload;
  try {
    payload = JSON.parse(base64UrlDecodeToString(b64)) as PasswordSetupTokenPayload;
  } catch {
    return { error: "Invalid token" };
  }

  if (!payload.uid || !payload.email || !payload.exp) return { error: "Invalid token" };
  if (Math.floor(Date.now() / 1000) > payload.exp) return { error: "Token expired" };
  return payload;
}


