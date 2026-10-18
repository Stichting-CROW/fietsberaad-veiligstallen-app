import { type NextApiRequest, type NextApiResponse } from "next";
import { loadSaldoOverzicht, type SaldoOverzicht } from "~/server/services/test/saldo-overzicht";
import { ensurePassReportAccess } from "~/server/services/test/pass-report-shared";

export type { SaldoOverzicht };

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SaldoOverzicht | { error: string }>
) {
  if (!(await ensurePassReportAccess(req, res))) return;

  try {
    const report = await loadSaldoOverzicht();
    res.status(200).json(report);
  } catch (error) {
    console.error("Error fetching saldo overzicht:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
