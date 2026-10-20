/**
 * BikeparkAccount.overboeken() and the two helpers it calls.
 * helperclass.getBTW, FinancialTransaction.setAmount, getCurrentVATpercentage.
 */

export const VAT_PERCENTAGE = 21;

export type ExploitantSaldoRow = {
  siteID: string;
  exploitantID: string;
  stallingstegoed: number;
  dateLastTransaction: Date | null;
};

export type OverboekingBooking = {
  amount: number;
  btw: number;
  btwPercentage: number;
  code: "overboeking";
  status: "ok";
  sourceSiteID: string;
  targetSiteID: "1";
  siteID: string;
};

/** helperclass.getBTW, then FinancialTransaction.setAmount: Round(btw * 100) / 100. */
export function btwOfAmount(amount: number, percentage = VAT_PERCENTAGE): number {
  const raw = amount - amount / (percentage / 100 + 1);
  return Math.round(raw * 100) / 100;
}

function booking(row: ExploitantSaldoRow): OverboekingBooking {
  const amount = -row.stallingstegoed;
  return {
    amount,
    btw: btwOfAmount(amount),
    btwPercentage: VAT_PERCENTAGE,
    code: "overboeking",
    status: "ok",
    sourceSiteID: row.exploitantID,
    targetSiteID: "1",
    siteID: row.siteID,
  };
}

/** QoQ `SELECT * FROM qSaldos WHERE stallingstegoed > 0`, query order unchanged. */
export function positiveOverboekingen(rows: ExploitantSaldoRow[]): OverboekingBooking[] {
  return rows.filter((row) => row.stallingstegoed > 0).map(booking);
}

/**
 * After the positive rows are stored, `getStallingstegoedFietsberaadForAccount`.
 * Deficits come from the original snapshot, `ORDER BY dateLastTransaction DESC`.
 * A row is booked only when `-stallingstegoed <=` the remaining credit.
 */
export function deficitOverboekingen(rows: ExploitantSaldoRow[], fietsberaadCredit: number): OverboekingBooking[] {
  if (!(fietsberaadCredit > 0)) return [];
  const negatives = rows
    .filter((row) => row.stallingstegoed < 0)
    .slice()
    .sort((a, b) => {
      const at = a.dateLastTransaction?.getTime() ?? Number.NEGATIVE_INFINITY;
      const bt = b.dateLastTransaction?.getTime() ?? Number.NEGATIVE_INFINITY;
      return bt - at;
    });
  const out: OverboekingBooking[] = [];
  let credit = fietsberaadCredit;
  for (const row of negatives) {
    if (-row.stallingstegoed <= credit) {
      out.push(booking(row));
      credit += row.stallingstegoed;
    }
  }
  return out;
}

/** fms/remote/cronjobs/overboeken.cfm selection. No placeholders. */
export const OVERBOEKEN_CATCH_UP_SQL = `SELECT accountID
FROM \`vw_stallingstegoedenexploitant\`
WHERE stallingstegoed != 0
ORDER BY dateLastTransaction DESC
LIMIT 10`;

export type CatchUpRow = { accountID: string | null };

export type CatchUpResult = {
  processed: string[];
  skipped: string[];
  errors: { accountId: string; message: string }[];
};

/**
 * One cfm loop pass per selected row.
 * A missing account is skipped. ColdFusion still calls overboeken() afterwards and aborts; that abort is not copied.
 * A thrown settlement is recorded and the loop continues.
 */
export async function runCatchUpRows(
  rows: CatchUpRow[],
  accountExists: (accountId: string) => Promise<boolean>,
  settle: (accountId: string) => Promise<void>,
): Promise<CatchUpResult> {
  const processed: string[] = [];
  const skipped: string[] = [];
  const errors: { accountId: string; message: string }[] = [];
  for (const row of rows) {
    const accountId = row.accountID ?? "";
    if (!accountId) {
      skipped.push(accountId);
      continue;
    }
    try {
      if (!(await accountExists(accountId))) {
        skipped.push(accountId);
        continue;
      }
      await settle(accountId);
      processed.push(accountId);
    } catch (error) {
      errors.push({ accountId, message: error instanceof Error ? error.message : String(error) });
    }
  }
  return { processed, skipped, errors };
}

export type OverboekenCronGate =
  | { kind: "method"; status: 405 }
  | { kind: "unauthorized"; status: 401 }
  | { kind: "disabled" }
  | { kind: "run" };

/** Same Bearer check as the other cron routes, then the Azure enable flag. */
export function overboekenCronGate(input: {
  method: string | undefined;
  authorization: string | undefined;
  cronSecret: string | undefined;
  enabled: string | undefined;
}): OverboekenCronGate {
  if (input.method !== "POST" && input.method !== "GET") return { kind: "method", status: 405 };
  const token = input.authorization?.startsWith("Bearer ") ? input.authorization.slice(7) : null;
  if (input.cronSecret && token !== input.cronSecret) return { kind: "unauthorized", status: 401 };
  if (input.enabled !== "1") return { kind: "disabled" };
  return { kind: "run" };
}
