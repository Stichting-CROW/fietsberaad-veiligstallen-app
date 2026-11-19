import { prisma } from "~/server/db";

export type SaldoOverzichtTypeCount = {
  code: string;
  count: number;
};

export type SaldoOverzichtRow = {
  accountID: string;
  email: string | null;
  saldo: number;
  transactiesPerType: SaldoOverzichtTypeCount[];
  gemeenten: string[];
};

export type SaldoOverzicht = {
  rows: SaldoOverzichtRow[];
};

type RawRow = {
  accountID: string;
  email: string | null;
  saldo: { toNumber?: () => number } | number | string | null;
  txCode: string | null;
  gemeente: string | null;
  n: bigint | number;
};

function toNumber(value: RawRow["saldo"]): number {
  if (value == null) return 0;
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value);
  return Number(value);
}

/**
 * Accounts with a positive saldo, or with at least one successful financial
 * transaction in the past year. Counts and municipalities cover that year only.
 */
export async function loadSaldoOverzicht(): Promise<SaldoOverzicht> {
  const raw = await prisma.$queryRaw<RawRow[]>`
    SELECT
      a.ID AS accountID,
      a.Email AS email,
      a.saldo AS saldo,
      CASE
        WHEN f.ID IS NULL THEN NULL
        ELSE COALESCE(f.code, '(geen code)')
      END AS txCode,
      c.CompanyName AS gemeente,
      COUNT(f.ID) AS n
    FROM accounts a
    LEFT JOIN financialtransactions f
      ON f.accountID = a.ID
     AND f.status = 'ok'
     AND COALESCE(f.transactionDate, f.dateCreated) >= DATE_SUB(NOW(), INTERVAL 1 YEAR)
    LEFT JOIN contacts c ON c.ID = f.siteID
    WHERE a.saldo > 0
       OR f.ID IS NOT NULL
    GROUP BY
      a.ID,
      a.Email,
      a.saldo,
      CASE
        WHEN f.ID IS NULL THEN NULL
        ELSE COALESCE(f.code, '(geen code)')
      END,
      c.CompanyName
    ORDER BY a.saldo DESC, a.Email
  `;

  const byAccount = new Map<string, SaldoOverzichtRow>();
  for (const row of raw) {
    let account = byAccount.get(row.accountID);
    if (!account) {
      account = {
        accountID: row.accountID,
        email: row.email,
        saldo: toNumber(row.saldo),
        transactiesPerType: [],
        gemeenten: [],
      };
      byAccount.set(row.accountID, account);
    }
    if (row.txCode) {
      const count = Number(row.n);
      const existing = account.transactiesPerType.find((item) => item.code === row.txCode);
      if (existing) existing.count += count;
      else account.transactiesPerType.push({ code: row.txCode, count });
    }
    if (row.gemeente && !account.gemeenten.includes(row.gemeente)) {
      account.gemeenten.push(row.gemeente);
    }
  }

  const rows = [...byAccount.values()];
  for (const row of rows) {
    row.transactiesPerType.sort((a, b) => b.count - a.count || a.code.localeCompare(b.code));
    row.gemeenten.sort((a, b) => a.localeCompare(b, "nl"));
  }
  rows.sort((a, b) => b.saldo - a.saldo || (a.email ?? "").localeCompare(b.email ?? ""));
  return { rows };
}
