import { type NextApiRequest, type NextApiResponse } from "next";
import {
  loadAccountReport,
  resolveAccountsByPas,
  type AccountPasMatch,
  type AccountReport,
} from "~/server/services/test/account-report";
import { ensurePassReportAccess } from "~/server/services/test/pass-report-shared";

export type { AccountPasMatch, AccountReport };

type AccountReportResponse = AccountReport | { matches: AccountPasMatch[] } | { error: string };

export default async function handler(req: NextApiRequest, res: NextApiResponse<AccountReportResponse>) {
  if (!(await ensurePassReportAccess(req, res))) return;

  const accountId = (req.query.accountId as string | undefined)?.trim() ?? "";
  const pasId = (req.query.pasId as string | undefined)?.replace(/\s+/g, "") ?? "";
  if (!accountId && !pasId) {
    res.status(400).json({ error: "Vul een accountnummer of een pas in" });
    return;
  }

  try {
    let resolvedAccountId = accountId;
    if (pasId) {
      const matches = await resolveAccountsByPas(pasId);
      if (matches.length === 0) {
        res.status(404).json({ error: "Pas niet gevonden" });
        return;
      }
      if (matches.length > 1 && !matches.some((m) => m.accountId === accountId)) {
        res.status(200).json({ matches });
        return;
      }
      resolvedAccountId = matches.find((m) => m.accountId === accountId)?.accountId ?? matches[0]!.accountId;
    }

    const report = await loadAccountReport(resolvedAccountId);
    if (!report) {
      res.status(404).json({ error: "Account niet gevonden" });
      return;
    }
    if (pasId) report.matchedPasId = pasId;
    res.status(200).json(report);
  } catch (error) {
    console.error("Error fetching account report:", error);
    res.status(500).json({ error: "Internal server error" });
  }
}
