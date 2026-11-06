export type MolliePayment = {
  id: string;
  status: string;
  checkoutUrl: string | null;
  transactionID: string;
};

type CreateInput = {
  amount: number;
  description: string;
  redirectUrl: string;
  webhookUrl: string;
  transactionID: string;
};

export function mollieApiKey(): string | null {
  const fromEnv = process.env.MOLLIE_API_KEY?.trim();
  return fromEnv ? fromEnv : null;
}

export async function createIdealPayment(input: CreateInput): Promise<MolliePayment> {
  const key = await paymentKey();
  if (!key) {
    return { id: `test_${input.transactionID.slice(0, 12)}`, status: "open", checkoutUrl: null, transactionID: input.transactionID };
  }
  const payload: Record<string, unknown> = {
    amount: { currency: "EUR", value: input.amount.toFixed(2) },
    description: input.description,
    redirectUrl: input.redirectUrl,
    method: "ideal",
    metadata: { transactionID: input.transactionID },
  };
  if (input.webhookUrl.startsWith("https://")) payload.webhookUrl = input.webhookUrl;
  const response = await fetch("https://api.mollie.com/v2/payments", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = (await response.json()) as {
    id?: string;
    status?: string;
    detail?: string;
    title?: string;
    metadata?: { transactionID?: string };
    _links?: { checkout?: { href?: string } };
  };
  if (!response.ok || !body.id) {
    throw new Error(body.detail || body.title || "Mollie-betaling mislukt");
  }
  return {
    id: body.id,
    status: body.status ?? "open",
    checkoutUrl: body._links?.checkout?.href ?? null,
    transactionID: body.metadata?.transactionID ?? input.transactionID,
  };
}

export async function fetchMolliePayment(id: string): Promise<{ status: string; transactionID: string } | null> {
  const key = await paymentKey();
  if (!key) return null;
  const response = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  if (!response.ok) return null;
  const body = (await response.json()) as { status?: string; metadata?: { transactionID?: string } };
  if (!body.metadata?.transactionID) return null;
  return { status: body.status ?? "open", transactionID: body.metadata.transactionID };
}

async function paymentKey(): Promise<string | null> {
  if (process.env.MOLLIE_API_KEY === "disabled") return null;
  return mollieApiKey() ?? (await keyFromSettings());
}

async function keyFromSettings(): Promise<string | null> {
  const { prisma } = await import("~/server/db");
  const row = await prisma.instellingen.findFirst({ select: { MollieAPIKey: true } });
  return row?.MollieAPIKey?.trim() || null;
}

export function ledgerStatus(mollieStatus: string): "ok" | "open" | "pending" | "cancelled" | "expired" | "failed" | string {
  if (mollieStatus === "paid") return "ok";
  if (mollieStatus === "canceled" || mollieStatus === "cancelled") return "cancelled";
  return mollieStatus;
}
