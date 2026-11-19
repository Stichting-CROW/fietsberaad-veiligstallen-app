import { Prisma } from "~/generated/prisma-client";
import { prisma } from "~/server/db";
import { escapeHtml } from "~/server/display/render";

export async function getLangstallersCounts(params: {
  councilSiteId: string;
  bikeparkExternalId?: string;
  hours: number;
}): Promise<{ key: string; n: number }[]> {
  const seconds = params.hours * 3600;
  if (params.bikeparkExternalId) {
    const rows = await prisma.$queryRaw<{ sectionID: string; n: bigint }[]>`
      SELECT SectieID as sectionID, count(*) as n
      FROM transacties
      WHERE TIME_TO_SEC(TIMEDIFF(now(),Date_checkin)) > ${seconds}
      AND Date_checkout IS NULL
      AND FietsenstallingID = ${params.bikeparkExternalId}
      GROUP BY SectieID
    `;
    return rows.map((r) => ({ key: r.sectionID, n: Number(r.n) }));
  }

  const bikeparks = await prisma.fietsenstallingen.findMany({
    where: {
      SiteID: params.councilSiteId,
      Status: "1",
      FMS: true,
      Type: { in: ["bewaakt", "fietskluizen"] },
    },
    select: { StallingsID: true },
  });
  const ids = bikeparks.map((b) => b.StallingsID).filter((id): id is string => !!id);
  if (ids.length === 0) return [];

  const rows = await prisma.$queryRaw<{ bikeparkID: string; n: bigint }[]>`
    SELECT FietsenstallingID as bikeparkID, count(*) as n
    FROM transacties
    WHERE TIME_TO_SEC(TIMEDIFF(now(),Date_checkin)) > ${seconds}
    AND Date_checkout IS NULL
    AND FietsenstallingID IN (${Prisma.join(ids)})
    GROUP BY FietsenstallingID
  `;
  return rows.map((r) => ({ key: r.bikeparkID, n: Number(r.n) }));
}

export async function getSaldotekortCounts(params: {
  councilSiteId: string;
  bikeparkExternalId?: string;
  maxSaldo: number;
}): Promise<{ key: string; n: number }[]> {
  if (params.bikeparkExternalId) {
    const rows = await prisma.$queryRaw<{ sectionID: string; n: bigint }[]>`
      SELECT s.externalID as sectionID,
        (
          SELECT count(*)
          FROM accounts_pasIDs ap
          INNER JOIN gemeenteaccounts g ON g.ID = ap.AccountID
          INNER JOIN accounts a ON g.AccountID = a.ID
          WHERE a.saldo < ${params.maxSaldo}
          AND ap.huidigeFietsenstallingId = ${params.bikeparkExternalId}
          AND ap.huidigeSectieId = s.externalID
        ) as n
      FROM fietsenstallingen f
      INNER JOIN fietsenstalling_sectie s ON s.fietsenstallingsId = f.ID
      WHERE f.StallingsID = ${params.bikeparkExternalId}
      ORDER BY s.externalID
    `;
    return rows.map((r) => ({ key: r.sectionID, n: Number(r.n) }));
  }

  const rows = await prisma.$queryRaw<{ bikeparkID: string; n: bigint }[]>`
    SELECT f.StallingsID as bikeparkID,
      (
        SELECT count(*)
        FROM accounts_pasIDs ap
        INNER JOIN gemeenteaccounts g ON g.ID = ap.AccountID
        INNER JOIN accounts a ON g.AccountID = a.ID
        WHERE a.saldo < ${params.maxSaldo}
        AND ap.huidigeFietsenstallingId = f.StallingsID
      ) as n
    FROM fietsenstallingen f
    WHERE f.SiteID = ${params.councilSiteId}
    AND f.FMS = 1
    ORDER BY f.Title
  `;
  return rows.map((r) => ({ key: r.bikeparkID, n: Number(r.n) }));
}

export async function resolveLangstallersLabels(params: {
  councilSiteId: string;
  bikeparkExternalId?: string;
  counts: { key: string; n: number }[];
}): Promise<{ title: string; n: number }[]> {
  if (params.bikeparkExternalId) {
    const bp = await prisma.fietsenstallingen.findFirst({
      where: { SiteID: params.councilSiteId, StallingsID: params.bikeparkExternalId },
      select: {
        fietsenstalling_secties: { select: { externalId: true, titel: true, sectieId: true } },
      },
    });
    const byExt = new Map(
      (bp?.fietsenstalling_secties ?? []).map((s) => [s.externalId ?? String(s.sectieId), s.titel])
    );
    return params.counts.map((c) => ({ title: byExt.get(c.key) ?? c.key, n: c.n }));
  }
  const parks = await prisma.fietsenstallingen.findMany({
    where: { SiteID: params.councilSiteId, Status: "1" },
    select: { StallingsID: true, Title: true },
  });
  const byId = new Map(parks.map((p) => [p.StallingsID ?? "", p.Title ?? p.StallingsID ?? ""]));
  return params.counts.map((c) => ({ title: byId.get(c.key) ?? c.key, n: c.n }));
}

export type PasTransactie = {
  checkin: string;
  checkout: string | null;
  typeCheckin: string | null;
  typeCheckout: string | null;
  stallingsId: string;
  description: string;
  /** Minus stallingskosten, as in overzichten Pas.cfm. */
  amount: number;
};

export type PasOverzicht = {
  found: boolean;
  email: string;
  gemeente: string;
  /** Null means the full history was returned. */
  days: number | null;
  transactions: PasTransactie[];
};

/**
 * Pass lookup from overzichten `Pas.cfm`.
 * An empty siteIds list does not filter municipalities (fietsberaad superadmin).
 * Visits are the last 30 days, unless allHistory is set. The amount is minus stallingskosten.
 */
export async function getPasOverzicht(params: {
  siteIds: string[];
  pasId: string;
  allHistory?: boolean;
}): Promise<PasOverzicht> {
  const empty: PasOverzicht = { found: false, email: "", gemeente: "", days: params.allHistory ? null : 30, transactions: [] };
  const pas = params.pasId.trim();
  const siteIds = params.siteIds.filter(Boolean);
  if (!pas) return empty;

  const rows = await prisma.accounts_pasids.findMany({
    where: {
      PasID: pas,
      ...(siteIds.length > 0 ? { SiteID: { in: siteIds } } : {}),
    },
    select: { AccountID: true, SiteID: true, Naam: true },
  });
  if (rows.length === 0) return empty;

  const siteNameRows = await prisma.contacts.findMany({
    where: { ID: { in: [...new Set(rows.map((row) => row.SiteID).filter((id): id is string => !!id))] } },
    select: { ID: true, CompanyName: true },
  });
  const siteName = new Map(siteNameRows.map((site) => [site.ID, site.CompanyName ?? ""]));
  const gemeente = [...new Set(rows.map((row) => (row.SiteID ? siteName.get(row.SiteID) ?? "" : "")).filter(Boolean))].join(", ");

  let email = "";
  for (const row of rows) {
    const ga = row.AccountID
      ? await prisma.gemeenteaccounts.findUnique({
          where: { ID: row.AccountID },
          select: { AccountID: true },
        })
      : null;
    const accountId = ga?.AccountID ?? row.AccountID;
    if (!accountId) continue;
    const account = await prisma.accounts.findUnique({
      where: { ID: accountId },
      select: { Email: true, account_type: true },
    });
    if (account && account.account_type !== "SYSTEM" && account.Email) {
      email = account.Email;
      break;
    }
  }

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const tx = await prisma.transacties.findMany({
    where: params.allHistory ? { PasID: pas } : { PasID: pas, Date_checkin: { gte: since } },
    orderBy: { Date_checkin: "desc" },
    select: {
      Date_checkin: true,
      Date_checkout: true,
      Type_checkin: true,
      Type_checkout: true,
      Stallingskosten: true,
      FietsenstallingID: true,
    },
  });

  const stallingIds = [...new Set(tx.map((row) => row.FietsenstallingID))];
  const parks = stallingIds.length
    ? await prisma.fietsenstallingen.findMany({
        where: { StallingsID: { in: stallingIds } },
        select: { StallingsID: true, Title: true },
      })
    : [];
  const titleByStallingsId = new Map(parks.map((park) => [park.StallingsID ?? "", park.Title ?? ""]));
  const passName = rows.map((row) => row.Naam?.trim() ?? "").find((name) => name.length > 0) ?? "";

  return {
    found: true,
    email,
    gemeente,
    days: params.allHistory ? null : 30,
    transactions: tx.map((t) => {
      const title = titleByStallingsId.get(t.FietsenstallingID) || t.FietsenstallingID;
      const kosten = t.Stallingskosten != null ? Number(t.Stallingskosten) : 0;
      return {
        checkin: t.Date_checkin.toISOString(),
        checkout: t.Date_checkout ? t.Date_checkout.toISOString() : null,
        typeCheckin: t.Type_checkin,
        typeCheckout: t.Type_checkout,
        stallingsId: t.FietsenstallingID,
        description: passName ? `Stalling ${passName} in ${title}` : `Stalling fiets in ${title}`,
        amount: -kosten,
      };
    }),
  };
}

export async function getPasOverzichtHtml(params: {
  councilSiteId: string;
  pasId: string;
}): Promise<string> {
  const pas = params.pasId.trim();
  if (!pas) return "";

  const result = await getPasOverzicht({ siteIds: [params.councilSiteId], pasId: pas });
  if (!result.found) {
    return `<p>Pas niet gevonden in deze gemeente.</p>`;
  }

  const linkText = result.email
    ? `Pas gekoppeld aan account van ${result.email}`
    : "Pas niet gekoppeld aan een account";

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Vandaag";
    return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  };
  const fmtTime = (iso: string) => {
    const d = new Date(iso);
    return `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
  };

  const rows = result.transactions
    .map((t) => {
      const color = t.amount > 0 ? "green" : t.amount < 0 ? "red" : "";
      const cin = t.typeCheckin && t.typeCheckin !== "user" ? ` (${t.typeCheckin})` : "";
      const cout = t.checkout && t.typeCheckout && t.typeCheckout !== "user" ? ` (${t.typeCheckout})` : "";
      return `<tr><td>${fmtDate(t.checkin)} ${fmtTime(t.checkin)}${cin}</td><td>${
        t.checkout ? `${fmtDate(t.checkout)} ${fmtTime(t.checkout)}${cout}` : ""
      }</td><td>${escapeHtml(t.description)}</td><td class="${color}">€ ${t.amount.toFixed(2)}</td></tr>`;
    })
    .join("");

  return `<p>${linkText}</p><table class="tbl"><thead><tr><th>Check in</th><th>Check uit</th><th>Omschrijving</th><th>Bij- en afschrijvingen</th></tr></thead><tbody>${rows || "<tr><td colspan='4'>Geen transacties gevonden voor pas in de afgelopen 30 dagen</td></tr>"}</tbody></table>`;
}
