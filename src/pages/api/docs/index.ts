import type { NextApiRequest, NextApiResponse } from "next";

/**
 * Redirects /api/docs to the Swagger UI page.
 * Prevents the [...nextcrud] catch-all from handling this path.
 */
export default function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method not allowed" });
    return;
  }
  res.redirect(302, "/test/fms-api-docs");
}
