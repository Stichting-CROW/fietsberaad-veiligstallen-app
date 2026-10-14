import { Prisma } from "~/generated/prisma-client";
import { prisma } from "~/server/db";

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

export async function getPasOverzichtHtml(params: {
  councilSiteId: string;
  pasId: string;
}): Promise<string> {
  const pas = params.pasId.trim();
  if (!pas) return "";

  const row = await prisma.accounts_pasids.findFirst({
    where: { SiteID: params.councilSiteId, PasID: pas },
    select: { AccountID: true },
  });
  if (!row) {
    return `<p>Pas niet gevonden in deze gemeente.</p>`;
  }

  let email = "";
  const ga = row.AccountID
    ? await prisma.gemeenteaccounts.findUnique({
        where: { ID: row.AccountID },
        select: { AccountID: true },
      })
    : null;
  const accountId = ga?.AccountID ?? row.AccountID;
  if (accountId) {
    const account = await prisma.accounts.findUnique({
      where: { ID: accountId },
      select: { email: true },
    });
    email = account?.email ?? "";
  }

  const linkText = email
    ? `Pas gekoppeld aan account van ${email}`
    : "Pas niet gekoppeld aan een account";

  const since = new Date();
  since.setDate(since.getDate() - 30);

  const tx = await prisma.transacties.findMany({
    where: { PasID: pas, Date_checkin: { gte: since } },
    orderBy: { Date_checkin: "desc" },
    take: 50,
    select: {
      Date_checkin: true,
      Date_checkout: true,
      Type_checkin: true,
      Type_checkout: true,
      Stallingskosten: true,
      FietsenstallingID: true,
    },
  });

  const fmtDate = (d: Date) => {
    const today = new Date();
    if (d.toDateString() === today.toDateString()) return "Vandaag";
    return `${String(d.getDate()).padStart(2, "0")}-${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
  };
  const fmtTime = (d: Date) => `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;

  const rows = tx
    .map((t) => {
      const amount = t.Stallingskosten != null ? Number(t.Stallingskosten) : 0;
      const color = amount >= 0 ? "green" : "red";
      const cin = t.Type_checkin && t.Type_checkin !== "user" ? ` (${t.Type_checkin})` : "";
      const cout =
        t.Date_checkout && t.Type_checkout && t.Type_checkout !== "user" ? ` (${t.Type_checkout})` : "";
      return `<tr><td>${fmtDate(t.Date_checkin)} ${fmtTime(t.Date_checkin)}${cin}</td><td>${
        t.Date_checkout ? `${fmtDate(t.Date_checkout)} ${fmtTime(t.Date_checkout)}${cout}` : "—"
      }</td><td>${t.FietsenstallingID}</td><td style="color:${color}">€ ${amount.toFixed(2)}</td></tr>`;
    })
    .join("");

  return `<p>${linkText}</p><table class="tbl"><thead><tr><th>Check in</th><th>Check uit</th><th>Stalling</th><th>Bedrag</th></tr></thead><tbody>${rows || "<tr><td colspan='4'>Geen transacties in de laatste 30 dagen</td></tr>"}</tbody></table>`;
}
