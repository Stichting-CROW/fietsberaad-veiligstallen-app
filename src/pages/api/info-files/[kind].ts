import type { NextApiRequest, NextApiResponse } from "next";
import { readOrGenerateInfoFile } from "~/server/services/info-files/generate";
import type { InfoFileName } from "~/server/services/info-files/store";

const FILES: Record<string, { name: InfoFileName; type: string }> = {
  kml: { name: "veiligstallen.kml", type: "application/vnd.google-earth.kml+xml; charset=utf-8" },
  xml: { name: "veiligstallen.xml", type: "text/xml; charset=utf-8" },
};

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.setHeader("Allow", "GET, HEAD");
    res.status(405).end();
    return;
  }
  const kind = Array.isArray(req.query.kind) ? req.query.kind[0] : req.query.kind;
  const file = kind ? FILES[kind] : undefined;
  if (!file) {
    res.status(404).end();
    return;
  }
  try {
    const body = await readOrGenerateInfoFile(file.name);
    res.setHeader("Content-Type", file.type);
    res.setHeader("Cache-Control", "public, max-age=300");
    if (req.method === "HEAD") {
      res.status(200).end();
      return;
    }
    res.status(200).send(body);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ ok: false, message });
  }
}
