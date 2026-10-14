import type { NextApiRequest, NextApiResponse } from "next";
import { sendOpsMail } from "~/modules/citizen-accounts/mail";
import { AccountError, resolveWebhook } from "~/modules/citizen-accounts/service";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function mailWebhookError(req: NextApiRequest, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const stack = error instanceof Error && error.stack ? error.stack : "";
  const html = `<h1>error</h1><pre>${escapeHtml(stack || message)}</pre>
<h1>form</h1><pre>${escapeHtml(JSON.stringify(req.body ?? {}, null, 2))}</pre>
<h1>request</h1><pre>${escapeHtml(JSON.stringify({ method: req.method, url: req.url, host: req.headers.host, userAgent: req.headers["user-agent"] }, null, 2))}</pre>`;
  try {
    await sendOpsMail(`ERROR: ${req.headers.host ?? ""} - error in webhook mollie ${message}`, html);
  } catch (mailError) {
    console.error("Foutmelding Mollie-webhook niet gemaild:", mailError);
  }
}

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Methode niet toegestaan" });
    return;
  }
  try {
    const body = req.body ?? {};
    const result = await resolveWebhook({
      id: body.id ? String(body.id) : undefined,
      status: body.status ? String(body.status) : undefined,
      metadata: body.metadata?.transactionID ? { transactionID: String(body.metadata.transactionID) } : undefined,
    });
    res.status(200).json({ ok: true, status: result.status });
  } catch (error) {
    console.error("Mollie-webhook mislukt:", error);
    await mailWebhookError(req, error);
    const message = error instanceof AccountError ? error.message : "Webhook mislukt";
    res.status(400).json({ error: message });
  }
}
