import moment from "moment";
import { prisma } from "~/server/db";
import { type ReportScope } from "~/backend/services/reports/scope";

/** Letters follow `fms/remote/cronjobs/financialReports.cfm`. */
export type FinancieelBedragen = {
  A: number; D: number; Daantal: number; E: number; Eaantal: number; F: number; Faantal: number;
  G: number; H: number; M: number; Maantal: number; N: number; Naantal: number; O: number; Oaantal: number;
  T: number; Taantal: number; U: number; Uaantal: number; W: number;
};

export type FinancieelPaar = {
  gemeenteId: string;
  gemeenteNaam: string;
  exploitantId: string;
  exploitantNaam: string;
  bedragen: FinancieelBedragen;
};

export type FinancieelMaandoverzicht = {
  scope: ReportScope["kind"];
  organisatieNaam: string;
  periodeStart: string;
  periodeEind: string;
  btwPercentage: number | null;
  paren: FinancieelPaar[];
};

type Row = { [K in keyof FinancieelBedragen]: unknown };

const queryBedragen = async (
  gemeenteId: string,
  exploitantId: string,
  start: string,
  end: string,
): Promise<FinancieelBedragen> => {
  const rows = await prisma.$queryRaw<Row[]>`
    SELECT
      COALESCE(-SUM(CASE WHEN targetSiteID = ${exploitantId} AND code = 'stallingstransactie' THEN amount END), 0) AS A,
      COALESCE(SUM(CASE WHEN paidToSiteID = ${exploitantId} AND code = 'betaling in stalling' THEN amount END), 0) AS D,
      SUM(paidToSiteID = ${exploitantId} AND code = 'betaling in stalling') AS Daantal,
      COALESCE(SUM(CASE WHEN amount > 0 AND sourceSiteID = ${exploitantId} AND code = 'overboeking' THEN amount END), 0) AS E,
      SUM(amount > 0 AND sourceSiteID = ${exploitantId} AND code = 'overboeking') AS Eaantal,
      COALESCE(SUM(CASE WHEN amount < 0 AND paidBySiteID = ${exploitantId} AND code = 'restitutie in stalling' THEN -amount END), 0) AS F,
      SUM(amount < 0 AND paidBySiteID = ${exploitantId} AND code = 'restitutie in stalling') AS Faantal,
      COALESCE(-SUM(CASE WHEN sourceSiteID = ${exploitantId} AND code = 'afwaardering in stalling' THEN amount END), 0) AS G,
      COALESCE(-SUM(CASE WHEN sourceSiteID = ${exploitantId} AND code = 'afwaardering door fms' THEN amount END), 0) AS H,
      COALESCE(-SUM(CASE WHEN amount < 0 AND sourceSiteID = ${exploitantId} AND targetSiteID = ${exploitantId} AND code = 'abonnement' THEN amount END), 0) AS M,
      SUM(amount < 0 AND sourceSiteID = ${exploitantId} AND targetSiteID = ${exploitantId} AND code = 'abonnement') AS Maantal,
      COALESCE(-SUM(CASE WHEN sourceSiteID = '1' AND targetSiteID = ${exploitantId} AND code = 'abonnement' THEN amount END), 0) AS N,
      SUM(sourceSiteID = '1' AND targetSiteID = ${exploitantId} AND code = 'abonnement') AS Naantal,
      COALESCE(-SUM(CASE WHEN amount > 0 AND sourceSiteID = ${exploitantId} AND targetSiteID = ${exploitantId} AND code = 'abonnement' THEN amount END), 0) AS O,
      SUM(amount > 0 AND sourceSiteID = ${exploitantId} AND targetSiteID = ${exploitantId} AND code = 'abonnement') AS Oaantal,
      COALESCE(-SUM(CASE WHEN amount < 0 AND sourceSiteID = '1' AND targetSiteID = ${exploitantId} AND code = 'reservering' THEN amount END), 0) AS T,
      SUM(amount < 0 AND sourceSiteID = '1' AND targetSiteID = ${exploitantId} AND code = 'reservering') AS Taantal,
      COALESCE(-SUM(CASE WHEN amount > 0 AND targetSiteID = ${exploitantId} AND code = 'reservering' THEN amount END), 0) AS U,
      SUM(amount > 0 AND targetSiteID = ${exploitantId} AND code = 'reservering') AS Uaantal,
      COALESCE(-SUM(CASE WHEN amount < 0 AND sourceSiteID = ${exploitantId} AND code = 'overboeking' THEN amount END), 0) AS W
    FROM financialtransactions
    WHERE transactionDate >= ${start} AND transactionDate < ${end}
      AND siteID = ${gemeenteId}
      AND status = 'ok'
  `;
  const row = rows[0];
  const out = {} as FinancieelBedragen;
  for (const key of Object.keys(row ?? {}) as Array<keyof FinancieelBedragen>) {
    out[key] = Math.round(Number(row?.[key] ?? 0) * 100) / 100;
  }
  return out;
};

/** True when any reported amount or transaction count is non-zero for this municipality–operator pair in the month. */
export const hasFinancieelActivity = (b: FinancieelBedragen): boolean =>
  (Object.values(b) as number[]).some((v) => Math.abs(v) > 0);

/**
 * On-demand version of the monthly PDF from `financialReports.cfm`.
 * A municipality sees one block per operator; an operator one block per municipality with the `fms` module.
 */
export const getFinancieelMaandoverzicht = async (
  scope: ReportScope,
  month: string,
): Promise<FinancieelMaandoverzicht> => {
  const startM = moment(`${month}-01`, "YYYY-MM-DD");
  const start = startM.format("YYYY-MM-DD 00:00:00");
  const end = startM.clone().add(1, "month").format("YYYY-MM-DD 00:00:00");

  const links = await prisma.contact_contact.findMany({
    where: scope.kind === "gemeente" ? { childSiteID: scope.contactId } : { parentSiteID: scope.contactId },
    select: {
      parentSiteID: true,
      childSiteID: true,
      isManagingContacts: { select: { CompanyName: true } },
      isManagedByContacts: {
        select: { CompanyName: true, modules_contacts: { where: { ModuleID: "fms" }, select: { ModuleID: true } } },
      },
    },
  });

  const relevant = scope.kind === "exploitant"
    ? links.filter((l) => (l.isManagedByContacts?.modules_contacts.length ?? 0) > 0)
    : links;

  const paren: FinancieelPaar[] = [];
  for (const link of relevant) {
    paren.push({
      gemeenteId: link.childSiteID,
      gemeenteNaam: link.isManagedByContacts?.CompanyName ?? link.childSiteID,
      exploitantId: link.parentSiteID,
      exploitantNaam: link.isManagingContacts?.CompanyName ?? link.parentSiteID,
      bedragen: await queryBedragen(link.childSiteID, link.parentSiteID, start, end),
    });
  }
  paren.sort((a, b) =>
    (scope.kind === "gemeente" ? a.exploitantNaam : a.gemeenteNaam).localeCompare(
      scope.kind === "gemeente" ? b.exploitantNaam : b.gemeenteNaam,
    ),
  );
  const parenMetActiviteit = paren.filter((p) => hasFinancieelActivity(p.bedragen));

  const btwRows = await prisma.$queryRaw<Array<{ btw: number | null }>>`
    SELECT MAX(btwPercentage) AS btw FROM financialtransactions
    WHERE transactionDate >= ${start} AND transactionDate < ${end}
  `;

  return {
    scope: scope.kind,
    organisatieNaam: scope.name,
    periodeStart: startM.format("YYYY-MM-DD"),
    periodeEind: startM.clone().endOf("month").format("YYYY-MM-DD"),
    btwPercentage: btwRows[0]?.btw != null ? Number(btwRows[0].btw) : null,
    paren: parenMetActiviteit,
  };
};
