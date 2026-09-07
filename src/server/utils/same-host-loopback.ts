import type { IncomingHttpHeaders } from "http";

/**
 * Detect when a URL targets this app (compare/write-test proxies).
 *
 * Prefer internal-api-fetch.ts (in-process handler invoke) over loopback HTTP.
 * Loopback helpers remain for callers not yet migrated.
 */

function headerValue(headers: IncomingHttpHeaders, name: string): string | undefined {
  const raw = headers[name];
  if (typeof raw === "string") return raw.split(",")[0]?.trim();
  if (Array.isArray(raw) && typeof raw[0] === "string") return raw[0].split(",")[0]?.trim();
  return undefined;
}

function hostnameFromRaw(raw: string | undefined): string | undefined {
  if (!raw) return undefined;
  try {
    const u = raw.includes("://") ? new URL(raw) : new URL(`http://${raw}`);
    return u.hostname.toLowerCase();
  } catch {
    return undefined;
  }
}

export function loopbackOrigin(): string {
  return `http://127.0.0.1:${process.env.PORT ?? "3000"}`;
}

export function isSameHostUrl(url: string, headers: IncomingHttpHeaders): boolean {
  try {
    const parsed = new URL(url);
    return sameHostNames(headers).has(parsed.hostname.toLowerCase());
  } catch {
    return false;
  }
}

export function sameHostNames(headers: IncomingHttpHeaders): Set<string> {
  const names = new Set<string>();
  const add = (raw?: string) => {
    const host = hostnameFromRaw(raw);
    if (host) names.add(host);
  };
  add(headerValue(headers, "host"));
  add(headerValue(headers, "x-forwarded-host"));
  add(process.env.NEXTAUTH_URL);
  add(process.env.WEBSITE_HOSTNAME);
  names.add("localhost");
  names.add("127.0.0.1");
  return names;
}

/** Rewrite URL to loopback when its hostname is this app. Leave other hosts unchanged. */
export function rewriteSameHostUrlToLoopback(url: string, headers: IncomingHttpHeaders): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (!sameHostNames(headers).has(parsed.hostname.toLowerCase())) return url;
  const loop = new URL(loopbackOrigin());
  parsed.protocol = loop.protocol;
  parsed.hostname = loop.hostname;
  parsed.port = loop.port;
  return parsed.toString();
}

/** Same for an origin / base URL (no required path). */
export function rewriteSameHostBaseToLoopback(baseUrl: string, headers: IncomingHttpHeaders): string {
  const trimmed = baseUrl.replace(/\/$/, "");
  return rewriteSameHostUrlToLoopback(`${trimmed}/`, headers).replace(/\/$/, "");
}
