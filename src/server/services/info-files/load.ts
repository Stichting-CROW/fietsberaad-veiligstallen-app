import { Prisma } from "~/generated/prisma-client";
import { prisma } from "~/server/db";
import type { Clock, InfoException, InfoSection, InfoStalling, InfoSubscription } from "./render";

const DAY_CODES = ["su", "mo", "tu", "we", "th", "fr", "sa"] as const;

type StallingRow = {
  ID: string;
  StallingsID: string | null;
  Title: string | null;
  Description: string | null;
  Location: string | null;
  Postcode: string | null;
  Plaats: string | null;
  Type: string | null;
  Capacity: number | null;
  Coordinaten: string | null;
  Verwijssysteem: unknown;
  FMS: unknown;
  Openingstijden: string | null;
  OmschrijvingTarieven: string | null;
  IsStationsstalling: unknown;
  Tariefcode: number | null;
  Toegangscontrole: number | null;
  Beheerder: string | null;
  BeheerderContact: string | null;
  ExtraServices: string | null;
  companyName: string | null;
  urlName: string | null;
  exploitant: string | null;
  services: string | null;
  capaciteit: unknown;
  capaciteitFiets: unknown;
  capaciteitBromfiets: unknown;
  capaciteitSpeciale: unknown;
  capaciteitElektrisch: unknown;
  capaciteitMotor: unknown;
  uitzonderingen: string | null;
  abonnementen: string | null;
  Open_ma: unknown;
  Dicht_ma: unknown;
  Open_di: unknown;
  Dicht_di: unknown;
  Open_wo: unknown;
  Dicht_wo: unknown;
  Open_do: unknown;
  Dicht_do: unknown;
  Open_vr: unknown;
  Dicht_vr: unknown;
  Open_za: unknown;
  Dicht_za: unknown;
  Open_zo: unknown;
  Dicht_zo: unknown;
};

const HOUR_COLUMNS: Record<(typeof DAY_CODES)[number], [keyof StallingRow, keyof StallingRow]> = {
  su: ["Open_zo", "Dicht_zo"],
  mo: ["Open_ma", "Dicht_ma"],
  tu: ["Open_di", "Dicht_di"],
  we: ["Open_wo", "Dicht_wo"],
  th: ["Open_do", "Dicht_do"],
  fr: ["Open_vr", "Dicht_vr"],
  sa: ["Open_za", "Dicht_za"],
};

export async function loadInfoStallingen(): Promise<InfoStalling[]> {
  const rows = await prisma.$queryRaw<StallingRow[]>`
    SELECT f.ID, f.StallingsID, f.Title, f.Description, f.Location, f.Postcode, f.Plaats, f.Type,
      f.Capacity, f.Coordinaten, f.Verwijssysteem, f.FMS, f.Openingstijden, f.OmschrijvingTarieven,
      f.IsStationsstalling, f.Tariefcode, f.Toegangscontrole, f.Beheerder, f.BeheerderContact, f.ExtraServices,
      f.Open_ma, f.Dicht_ma, f.Open_di, f.Dicht_di, f.Open_wo, f.Dicht_wo, f.Open_do, f.Dicht_do,
      f.Open_vr, f.Dicht_vr, f.Open_za, f.Dicht_za, f.Open_zo, f.Dicht_zo,
      gemeente.CompanyName AS companyName, gemeente.UrlName AS urlName, exploitant.CompanyName AS exploitant,
      (SELECT GROUP_CONCAT(s.Name) FROM fietsenstallingen_services fs INNER JOIN services s ON s.ID = fs.ServiceID WHERE fs.FietsenstallingID = f.ID) AS services,
      COALESCE(caps.capaciteit, 0) AS capaciteit,
      COALESCE(caps.capaciteitFiets, 0) AS capaciteitFiets,
      COALESCE(caps.capaciteitBromfiets, 0) AS capaciteitBromfiets,
      COALESCE(caps.capaciteitSpeciale, 0) AS capaciteitSpeciale,
      COALESCE(caps.capaciteitElektrisch, 0) AS capaciteitElektrisch,
      COALESCE(caps.capaciteitMotor, 0) AS capaciteitMotor,
      ex.uitzonderingen AS uitzonderingen,
      (SELECT GROUP_CONCAT(av.naam, '~', av.prijs SEPARATOR '^')
        FROM abonnementsvorm_fietsenstalling abo
        INNER JOIN abonnementsvormen av ON av.ID = abo.SubscriptiontypeID
        WHERE abo.BikeparkID = f.ID) AS abonnementen
    FROM fietsenstallingen f
    INNER JOIN contacts gemeente ON f.SiteID = gemeente.ID
    LEFT JOIN contacts exploitant ON f.ExploitantID = exploitant.ID
    LEFT JOIN (
      SELECT sec.fietsenstallingsId,
        COALESCE(SUM(sft.Capaciteit), 0) AS capaciteit,
        COALESCE(SUM(IF(sft.BikeTypeID = 1, sft.Capaciteit, 0)), 0) AS capaciteitFiets,
        COALESCE(SUM(IF(sft.BikeTypeID = 2, sft.Capaciteit, 0)), 0) AS capaciteitBromfiets,
        COALESCE(SUM(IF(sft.BikeTypeID = 3, sft.Capaciteit, 0)), 0) AS capaciteitSpeciale,
        COALESCE(SUM(IF(sft.BikeTypeID = 4, sft.Capaciteit, 0)), 0) AS capaciteitElektrisch,
        COALESCE(SUM(IF(sft.BikeTypeID = 5, sft.Capaciteit, 0)), 0) AS capaciteitMotor
      FROM fietsenstalling_sectie sec
      LEFT JOIN sectie_fietstype sft ON sft.sectieID = sec.sectieId
      WHERE sec.isKluis = 0
      GROUP BY sec.fietsenstallingsId
    ) caps ON caps.fietsenstallingsId = f.ID
    LEFT JOIN (
      SELECT fietsenstallingsID, GROUP_CONCAT(ID) AS uitzonderingen
      FROM uitzonderingenopeningstijden
      WHERE closingDateTime > CURDATE()
        AND closingDateTime < DATE_ADD(CURDATE(), INTERVAL 8 DAY)
      GROUP BY fietsenstallingsID
    ) ex ON ex.fietsenstallingsID = f.ID
    WHERE f.Status = '1'
      AND gemeente.CompanyName <> 'Testgemeente'
    ORDER BY f.StallingsID
  `;

  const verwijzen = rows.filter((row) => asBool(row.Verwijssysteem) && row.StallingsID);
  const withExceptions = rows.filter((row) => (row.uitzonderingen ?? "").length > 0);
  const [occupations, sections, exceptions] = await Promise.all([
    loadOccupations(verwijzen.map((row) => row.StallingsID!).filter(Boolean)),
    loadSections(verwijzen.map((row) => row.ID)),
    loadExceptions(withExceptions.map((row) => row.ID)),
  ]);

  return rows.map((row) => toStalling(row, occupations, sections, exceptions));
}

async function loadOccupations(stallingsIds: string[]): Promise<Map<string, number | null>> {
  const map = new Map<string, number | null>();
  if (stallingsIds.length === 0) return map;
  const rows = await prisma.$queryRaw<{ stallingsId: string; bezetting: unknown }[]>`
    SELECT f.StallingsID AS stallingsId, SUM(s.Bezetting) AS bezetting
    FROM fietsenstallingen f
    INNER JOIN fietsenstalling_sectie s ON s.fietsenstallingsId = f.ID
    WHERE f.StallingsID IN (${Prisma.join(stallingsIds)})
    GROUP BY f.StallingsID
  `;
  for (const row of rows) map.set(row.stallingsId, row.bezetting == null ? null : asNum(row.bezetting));
  return map;
}

async function loadSections(ids: string[]): Promise<Map<string, InfoSection[]>> {
  const map = new Map<string, InfoSection[]>();
  if (ids.length === 0) return map;
  const rows = await prisma.$queryRaw<{
    externalId: string | null;
    titel: string | null;
    fietsenstallingsId: string | null;
    capaciteit: unknown;
    bezetting: unknown;
    bulkreservering: unknown;
  }[]>`
    SELECT s.externalId, s.titel, s.fietsenstallingsId,
      COALESCE(s.capaciteit, 0) AS capaciteit,
      COALESCE(s.Bezetting, 0) AS bezetting,
      (
        SELECT b.Aantal
        FROM bulkreservering b
        LEFT JOIN bulkreserveringuitzondering bu
          ON bu.BulkreservationID = b.ID AND DATE(b.Startdatumtijd) = bu.datum
        WHERE b.SectieID = s.sectieId
          AND NOW() >= b.Startdatumtijd
          AND b.Einddatumtijd > NOW()
          AND bu.ID IS NULL
        -- ColdFusion errors when two holds overlap. One row keeps the file.
        LIMIT 1
      ) AS bulkreservering
    FROM fietsenstalling_sectie s
    WHERE s.fietsenstallingsId IN (${Prisma.join(ids)})
  `;
  for (const row of rows) {
    const id = row.fietsenstallingsId ?? "";
    const list = map.get(id) ?? [];
    list.push({
      externalId: row.externalId ?? "",
      titel: row.titel ?? "",
      capaciteit: asNum(row.capaciteit),
      bezetting: asNum(row.bezetting),
      bulk: row.bulkreservering == null ? null : asNum(row.bulkreservering),
    });
    map.set(id, list);
  }
  return map;
}

async function loadExceptions(ids: string[]): Promise<Map<string, InfoException[]>> {
  const map = new Map<string, InfoException[]>();
  if (ids.length === 0) return map;
  const rows = await prisma.$queryRaw<{ fietsenstallingsID: string | null; openingDateTime: Date | null; closingDateTime: Date | null }[]>`
    SELECT fietsenstallingsID, openingDateTime, closingDateTime
    FROM uitzonderingenopeningstijden
    WHERE fietsenstallingsID IN (${Prisma.join(ids)})
      AND closingDateTime > CURDATE()
      AND closingDateTime < DATE_ADD(CURDATE(), INTERVAL 8 DAY)
  `;
  for (const row of rows) {
    if (!row.fietsenstallingsID || !row.openingDateTime || !row.closingDateTime) continue;
    const list = map.get(row.fietsenstallingsID) ?? [];
    list.push({ opening: row.openingDateTime, closing: row.closingDateTime });
    map.set(row.fietsenstallingsID, list);
  }
  return map;
}

function toStalling(
  row: StallingRow,
  occupations: Map<string, number | null>,
  sections: Map<string, InfoSection[]>,
  exceptions: Map<string, InfoException[]>
): InfoStalling {
  const stallingsId = row.StallingsID ?? "";
  return {
    stallingsId,
    title: row.Title ?? "",
    description: row.Description ?? "",
    location: row.Location ?? "",
    postcode: row.Postcode ?? "",
    plaats: row.Plaats ?? "",
    type: row.Type ?? "",
    urlName: row.urlName ?? "",
    companyName: row.companyName ?? "",
    coordinates: row.Coordinaten ?? "",
    capacityColumn: row.Capacity ?? 0,
    capaciteitSum: asNum(row.capaciteit),
    capaciteitFiets: asNum(row.capaciteitFiets),
    capaciteitBromfiets: asNum(row.capaciteitBromfiets),
    capaciteitSpeciale: asNum(row.capaciteitSpeciale),
    capaciteitElektrisch: asNum(row.capaciteitElektrisch),
    capaciteitMotor: asNum(row.capaciteitMotor),
    verwijssysteem: asBool(row.Verwijssysteem),
    occupation: occupations.has(stallingsId) ? (occupations.get(stallingsId) ?? null) : null,
    fms: asBool(row.FMS),
    exploitant: row.exploitant ?? "",
    tariefcode: row.Tariefcode,
    tariefOmschrijving: row.OmschrijvingTarieven ?? "",
    toegangscontrole: row.Toegangscontrole,
    beheerder: row.Beheerder ?? "",
    beheerderContact: row.BeheerderContact ?? "",
    services: row.services ?? "",
    extraServices: row.ExtraServices ?? "",
    openingstijden: row.Openingstijden ?? "",
    isStationsstalling: asBool(row.IsStationsstalling),
    hasOpeningExceptions: (row.uitzonderingen ?? "").length > 0,
    dayHours: dayHours(row),
    exceptions: exceptions.get(row.ID) ?? [],
    sections: sections.get(row.ID) ?? [],
    subscriptions: parseSubscriptions(row.abonnementen),
  };
}

function dayHours(row: StallingRow): Record<string, Clock> {
  const hours: Record<string, Clock> = {};
  for (const code of ["su", "mo", "tu", "we", "th", "fr", "sa"] as const) {
    const [openKey, closeKey] = HOUR_COLUMNS[code];
    hours[code] = { open: asTime(row[openKey]), close: asTime(row[closeKey]) };
  }
  return hours;
}

export function parseSubscriptions(raw: string | null): InfoSubscription[] {
  if (!raw) return [];
  return raw.split("^").filter((part) => part.length > 0).map((part) => {
    const tilde = part.indexOf("~");
    if (tilde < 0) return { naam: part, prijs: "" };
    return { naam: part.slice(0, tilde), prijs: part.slice(tilde + 1) };
  });
}

function asTime(value: unknown): Date | null {
  if (value == null) return null;
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === "string") {
    const match = value.match(/(\d{1,2}):(\d{2})/);
    if (!match) return null;
    return new Date(Date.UTC(1970, 0, 1, Number(match[1]), Number(match[2]), 0));
  }
  return null;
}

function asNum(value: unknown): number {
  if (value == null) return 0;
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "object" && value !== null && "toNumber" in value && typeof (value as { toNumber: () => number }).toNumber === "function") {
    return (value as { toNumber: () => number }).toNumber();
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function asBool(value: unknown): boolean {
  if (typeof Buffer !== "undefined" && Buffer.isBuffer(value)) return value.length > 0 && value[0] !== 0;
  if (typeof value === "bigint") return value !== 0n;
  return value === true || value === 1 || value === "1";
}
