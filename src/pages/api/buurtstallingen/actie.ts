import type { NextApiRequest, NextApiResponse } from "next";
import { handleSignedAction } from "~/modules/buurtstallingen/application/service";
import { sendBuurtstallingenError } from "~/modules/buurtstallingen/application/http";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const token = typeof req.query.token === "string" ? req.query.token : "";
  try {
    const chosen = typeof req.query.abonnement === "string" ? Number(req.query.abonnement) : null;
    const result = await handleSignedAction(token, chosen !== null && Number.isFinite(chosen) ? chosen : null);
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    if ("choices" in result && result.choices) {
      const items = result.choices.map((form) => {
        const label = `${form.name ?? "Abonnement"}${form.price ? ` € ${form.price}` : ""}`;
        const href = `?token=${encodeURIComponent(token)}&abonnement=${form.id}`;
        return `<li><a href="${href}">${escapeHtml(label)}</a></li>`;
      }).join("");
      res.status(200).send(`<!doctype html><html lang="nl"><body><p>Kies een abonnementsvorm</p><ul>${items}</ul></body></html>`);
      return;
    }
    res.status(200).send(`<!doctype html><html lang="nl"><body><p>${escapeHtml(result.message)}</p></body></html>`);
  } catch (error) {
    sendBuurtstallingenError(res, error);
  }
}
