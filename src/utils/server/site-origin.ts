import type { NextApiRequest } from "next";

/** Scheme and host for absolute links back into the app; NEXTAUTH_URL may carry a path such as `/login`. */
export function siteOrigin(req: NextApiRequest): string {
  const configured = process.env.NEXTAUTH_URL?.trim();
  if (configured) {
    try {
      return new URL(configured).origin;
    } catch {
      // fall through to the request host
    }
  }
  return `http://${req.headers.host}`;
}
