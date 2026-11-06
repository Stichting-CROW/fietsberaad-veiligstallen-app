import type { NextApiRequest, NextApiResponse } from "next";
import { requireSuperadmin, sendError } from "~/server/background/api";
import { listTasks } from "~/server/background/queue";

const str = (value: unknown) => (typeof value === "string" && value !== "" ? value : undefined);

function date(value: unknown): Date | undefined {
  const text = str(value);
  if (!text) return undefined;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).json({ error: "Method not allowed" });
  }
  if (!(await requireSuperadmin(req, res))) return;

  try {
    const result = await listTasks({
      type: str(req.query.type),
      status: str(req.query.status),
      from: date(req.query.from),
      to: date(req.query.to),
      page: Number(req.query.page ?? 0) || 0,
      pageSize: Number(req.query.pageSize ?? 50) || 50,
      sort: req.query.sort === "duration" ? "duration" : "created",
      dir: req.query.dir === "asc" ? "asc" : "desc",
    });
    return res.status(200).json({ now: new Date().toISOString(), ...result });
  } catch (error) {
    return sendError(res, error);
  }
}
