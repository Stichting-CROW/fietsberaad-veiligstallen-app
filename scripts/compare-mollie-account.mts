import { PrismaClient } from "../src/generated/prisma-client";

const email = process.argv[2] ?? "mosbuma@bumos.nl";
const key = process.env.MOLLIE_API_KEY?.trim();
if (!key) throw new Error("MOLLIE_API_KEY missing");

const p = new PrismaClient();

async function getPayment(id: string) {
  const r = await fetch(`https://api.mollie.com/v2/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${key}` },
  });
  return r.json() as Promise<{ status?: string; metadata?: { transactionID?: string } }>;
}

async function main() {
  const acc = await p.accounts.findFirst({ where: { Email: email }, select: { ID: true, saldo: true } });
  if (!acc) throw new Error("account not found");
  console.log("account", acc.ID, "saldo", acc.saldo);

  const local = await p.financialtransactions.findMany({
    where: { accountID: acc.ID, mollieTransactionID: { not: null } },
    select: { ID: true, mollieTransactionID: true, status: true, code: true, amount: true, subscriptionID: true },
  });
  console.log("\nLocal ↔ Mollie (GET /v2/payments/{id}):");
  for (const row of local) {
    const m = await getPayment(row.mollieTransactionID!);
    console.log({
      localTx: row.ID,
      mollieId: row.mollieTransactionID,
      localStatus: row.status,
      mollieStatus: m.status,
      amount: Number(row.amount),
      code: row.code,
      subscriptionID: row.subscriptionID,
      metadataTransactionID: m.metadata?.transactionID,
      metadataMatch: m.metadata?.transactionID === row.ID,
    });
  }

  const debits = await p.financialtransactions.findMany({
    where: { accountID: acc.ID, code: "abonnement", status: "ok" },
    select: { ID: true, subscriptionID: true, amount: true, transactionDate: true },
    orderBy: { transactionDate: "asc" },
  });
  console.log("\nAbonnement ledger debits (no Mollie id):");
  for (const d of debits) console.log(d);

  const okSum = await p.financialtransactions.aggregate({
    where: { accountID: acc.ID, status: "ok" },
    _sum: { amount: true },
  });
  console.log("\nSum of ok transactions:", Number(okSum._sum.amount ?? 0));
}

main()
  .finally(() => p.$disconnect());
