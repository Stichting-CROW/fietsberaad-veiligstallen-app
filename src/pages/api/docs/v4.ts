import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Compatibility redirect: canonical Swagger UI is /docs/api/v4.
 * Occupies this path so [...nextcrud] does not handle it.
 */
export default function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  res.redirect(302, "/docs/api/v4");
}
