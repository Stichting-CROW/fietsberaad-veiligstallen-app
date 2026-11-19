import type { NextApiRequest, NextApiResponse } from "next";
import { AccountError, deleteProduct, listAllProducts, saveProduct } from "~/modules/citizen-accounts/service";
import { requireCitizenBeheer } from "~/utils/server/citizen-beheer-access";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const access = await requireCitizenBeheer(req, res, { fietsberaadOnly: true });
  if (!access) return;
  try {
    if (req.method === "GET") {
      const rows = await listAllProducts();
      res.status(200).json({
        data: rows.map((row) => ({
          id: row.ID,
          titel: row.titel,
          omschrijving: row.omschrijving,
          prijs: row.prijs === null ? 0 : Number(row.prijs),
          credit: row.credit === null ? 0 : Number(row.credit),
          status: row.status,
        })),
      });
      return;
    }
    if (req.method === "POST") {
      const saved = await saveProduct({
        id: req.body.id ? Number(req.body.id) : undefined,
        titel: String(req.body.titel ?? ""),
        omschrijving: String(req.body.omschrijving ?? ""),
        prijs: Number(req.body.prijs),
        credit: Number(req.body.credit),
        status: String(req.body.status ?? "1"),
      });
      res.status(200).json({ id: saved.ID });
      return;
    }
    if (req.method === "DELETE") {
      await deleteProduct(Number(req.body?.id ?? req.query.id));
      res.status(200).json({ ok: true });
      return;
    }
    res.status(405).json({ error: "Methode niet toegestaan" });
  } catch (error) {
    const message = error instanceof AccountError ? error.message : "Product niet opgeslagen";
    res.status(400).json({ error: message });
  }
}
