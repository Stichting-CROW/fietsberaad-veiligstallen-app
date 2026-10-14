import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import bcrypt from "bcryptjs";

const BCRYPT_COST = 13;

export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_COST);
}

export async function verifyPassword(password: string, hash: string | null | undefined): Promise<boolean> {
  if (!hash) return false;
  return bcrypt.compare(password, hash);
}

function secret(): string {
  const value = process.env.NEXTAUTH_SECRET;
  if (!value) throw new Error("NEXTAUTH_SECRET ontbreekt");
  return value;
}

export type CitizenSession = { accountId: string; exp: number };

export function signCitizenSession(accountId: string, now = Date.now()): string {
  const payload: CitizenSession = { accountId, exp: now + 1000 * 60 * 60 * 24 * 14 };
  return signPayload(payload);
}

export function readCitizenSession(token: string | undefined, now = Date.now()): CitizenSession | null {
  const payload = readPayload<CitizenSession>(token);
  if (!payload?.accountId || payload.exp < now) return null;
  return payload;
}

export type SignedAction = {
  accountId: string;
  action: "accept" | "decline" | "leave" | "contract" | "machtiging";
  targetId: string;
  exp: number;
};

export function signAction(action: Omit<SignedAction, "exp">, now = Date.now()): string {
  const payload: SignedAction = { ...action, exp: now + 1000 * 60 * 60 * 24 * 21 };
  return signPayload(payload);
}

export function readAction(token: string | undefined, now = Date.now()): SignedAction | null {
  const payload = readPayload<SignedAction>(token);
  if (!payload?.accountId || !payload.action || !payload.targetId || payload.exp < now) return null;
  return payload;
}

export type PasswordReset = { email: string; purpose: "reset"; exp: number };

export function signPasswordReset(email: string, now = Date.now()): string {
  const payload: PasswordReset = { email, purpose: "reset", exp: now + 1000 * 60 * 60 * 2 };
  return signPayload(payload);
}

export function readPasswordReset(token: string | undefined, now = Date.now()): PasswordReset | null {
  const payload = readPayload<PasswordReset>(token);
  if (!payload?.email || payload.purpose !== "reset" || payload.exp < now) return null;
  return payload;
}

function signPayload(payload: object): string {
  const body = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = createHmac("sha256", secret()).update(body).digest("base64url");
  return `${body}.${sig}`;
}

function readPayload<T>(token: string | undefined): T | null {
  if (!token) return null;
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const expected = createHmac("sha256", secret()).update(body).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
  try {
    return JSON.parse(Buffer.from(body, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}

export const CITIZEN_COOKIE = "vs_buurtstallingen";

export function readCookie(header: string | undefined, name: string): string | undefined {
  if (!header) return undefined;
  const part = header.split(";").map((item) => item.trim()).find((item) => item.startsWith(`${name}=`));
  return part ? decodeURIComponent(part.slice(name.length + 1)) : undefined;
}

export function newId(): string {
  return randomBytes(16).toString("hex");
}

export function citizenCookieHeader(token: string): string {
  return `${CITIZEN_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${60 * 60 * 24 * 14}`;
}

export function clearCitizenCookieHeader(): string {
  return `${CITIZEN_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}
