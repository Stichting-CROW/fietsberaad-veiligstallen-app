import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { NextApiRequest, NextApiResponse } from "next";
import path from "node:path";
import { libraryRoot } from "~/server/test-env/library";

const TYPES: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.status(405).end();
    return;
  }
  const parts = req.query.path;
  const segments = Array.isArray(parts) ? parts : parts ? [parts] : [];
  if (segments.length === 0 || segments.some((segment) => segment === "." || segment === ".." || segment.includes("/") || segment.includes("\\"))) {
    res.status(400).end();
    return;
  }
  const root = path.resolve(libraryRoot());
  const filePath = path.resolve(root, ...segments);
  if (!filePath.startsWith(root + path.sep)) {
    res.status(400).end();
    return;
  }
  try {
    const info = await stat(filePath);
    if (!info.isFile()) {
      res.status(404).end();
      return;
    }
    res.setHeader("Content-Type", TYPES[path.extname(filePath).toLowerCase()] ?? "application/octet-stream");
    res.setHeader("Cache-Control", "public, max-age=3600");
    if (req.method === "HEAD") {
      res.status(200).end();
      return;
    }
    createReadStream(filePath).pipe(res);
  } catch {
    res.status(404).end();
  }
}
