import type { NextApiRequest, NextApiResponse } from "next";

/**
 * GET /statistics - deprecated. Use /statistics/stallings and /statistics/data instead.
 */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === "GET") {
    return res.status(410).json({
      message: "Use /statistics/stallings (fetch once) and /statistics/data (fetch on refresh) instead",
    });
  }
  res.setHeader("Allow", "GET");
  return res.status(405).json({ message: "Method not allowed" });
}
