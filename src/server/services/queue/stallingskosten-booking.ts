/**
 * Books the stalling fee ColdFusion writes in createStallingstransaction.
 * The visit total is already on transacties.Stallingskosten. This books only the
 * difference against existing fee rows, so a repeated upload does not charge twice.
 */

import { Prisma, PrismaClient } from "~/generated/prisma-client";
import { randomUUID } from "crypto";
import { updateRowsById } from "./batch-sql";

const FEE_CODES = ["Stallingstransactie", "Afwaardering in stalling"] as const;
const VAT_PERCENTAGE = 21;

type PrismaDb = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$use" | "$extends" | "$transaction"
>;

export type ManagedFeeVisit = {
  transactionID: number;
  /** Visit total already stored on transacties.Stallingskosten. */
  stallingskosten: number;
  eventDate: Date;
  /** Short stalling id (fietsenstallingen.StallingsID), stored as financialtransactions.bikeparkID. */
  stallingsID: string;
  sectionExternalId: string;
  bikeTypeID: number;
  placeID: bigint | null;
  siteID: string;
  passID: string;
  pastype: string;
};

export function moneyDelta(total: number, alreadyBooked: number): number {
  return Math.round((total - alreadyBooked) * 100) / 100;
}

/** Inclusive VAT, rounded to cents the way ColdFusion Round() does for this amount. */
export function vatIncluded(amount: number, percentage = VAT_PERCENTAGE): number {
  const raw = amount - amount / (percentage / 100 + 1);
  return Math.round(raw * 100) / 100;
}

/** BikeparkSection.getDisplayName. */
export function sectionDisplayName(input: {
  sectionCount: number;
  sectionTitle: string;
  stallingTitle: string | null;
  stallingType: string | null;
  city: string | null;
  councilName: string | null;
}): string {
  const title = input.stallingTitle ?? "";
  let name: string;
  if (input.sectionCount === 1) {
    name = title;
  } else if (input.stallingType === "fietskluizen") {
    name = `kluis ${input.sectionTitle}`;
  } else {
    name = `sector ${input.sectionTitle}`;
  }
  if (input.sectionCount !== 1 && title.length > 0) {
    name += ` van locatie ${title}`;
  }
  const place = input.city && input.city.length > 0 ? input.city : (input.councilName ?? "");
  return `${name} te ${place}`;
}

/** createStallingstransaction description and code. A negative delta lowers a fee already booked. */
export function stallingFeeCopy(
  delta: number,
  bikeTypeName: string,
  stallingType: string | null,
  displayName: string
): { code: string; description: string } {
  if (delta < 0) {
    return {
      code: "Afwaardering in stalling",
      description: `Correctie betaling stalling in ${displayName}`.slice(0, 255),
    };
  }
  if (stallingType === "fietskluizen") {
    return {
      code: "Stallingstransactie",
      description: `Stalling in kluis ${displayName}`.slice(0, 255),
    };
  }
  return {
    code: "Stallingstransactie",
    description: `Stalling ${bikeTypeName.toLowerCase()} in ${displayName}`.slice(0, 255),
  };
}

function shortUUID(): string {
  return randomUUID().replace(/-/g, "");
}

function passKey(siteID: string, passID: string, pastype: string): string {
  return `${siteID}\0${passID}\0${pastype}`;
}

/**
 * After the visit row is saved: book the fee difference, set the pass's current cost,
 * and refresh accounts.saldo from vw_stallingstegoeden (that view includes historischesaldos).
 */
export async function bookManagedVisitFees(db: PrismaDb, visits: ManagedFeeVisit[]): Promise<void> {
  if (visits.length === 0) return;

  const stallingsIDs = [...new Set(visits.map((visit) => visit.stallingsID))];
  const sectionIDs = [...new Set(visits.map((visit) => visit.sectionExternalId))];
  const bikeTypeIDs = [...new Set(visits.map((visit) => visit.bikeTypeID))];
  const transactionIDs = [...new Set(visits.map((visit) => visit.transactionID))];

  const [stallings, sections, bikeTypes, booked] = await Promise.all([
    db.fietsenstallingen.findMany({
      where: { StallingsID: { in: stallingsIDs } },
      select: {
        StallingsID: true,
        Title: true,
        Plaats: true,
        Type: true,
        ExploitantID: true,
        contacts_fietsenstallingen_SiteIDTocontacts: { select: { CompanyName: true } },
        _count: { select: { fietsenstalling_secties: true } },
      },
    }),
    db.fietsenstalling_sectie.findMany({
      where: { externalId: { in: sectionIDs } },
      select: { externalId: true, titel: true },
    }),
    db.fietstypen.findMany({
      where: { ID: { in: bikeTypeIDs } },
      select: { ID: true, Name: true },
    }),
    db.financialtransactions.groupBy({
      by: ["transactionID"],
      where: { transactionID: { in: transactionIDs }, code: { in: [...FEE_CODES] } },
      _sum: { amount: true },
    }),
  ]);

  const stallingOf = new Map(
    stallings.filter((row) => row.StallingsID).map((row) => [row.StallingsID as string, row])
  );
  const sectionTitleOf = new Map(sections.map((row) => [row.externalId, row.titel ?? ""]));
  const bikeTypeOf = new Map(bikeTypes.map((row) => [row.ID, row.Name ?? ""]));
  const bookedOf = new Map(
    booked
      .filter((row) => row.transactionID != null)
      .map((row) => [row.transactionID as number, row._sum.amount == null ? 0 : -Number(row._sum.amount)])
  );

  const passes = await db.accounts_pasids.findMany({
    where: {
      OR: visits.map((visit) => ({
        SiteID: visit.siteID,
        PasID: visit.passID,
        Pastype: visit.pastype,
      })),
    },
    select: { ID: true, SiteID: true, PasID: true, Pastype: true, AccountID: true, dateLastCheck: true },
  });
  const passOf = new Map(
    passes
      .filter((pass): pass is typeof pass & { SiteID: string } => pass.SiteID != null)
      .map((pass) => [passKey(pass.SiteID, pass.PasID, pass.Pastype), pass])
  );
  const passAccountIDs = [...new Set(passes.map((pass) => pass.AccountID).filter((id): id is string => !!id))];
  const links = passAccountIDs.length === 0
    ? []
    : await db.gemeenteaccounts.findMany({
        where: { ID: { in: passAccountIDs } },
        select: { ID: true, AccountID: true },
      });
  const topAccountOf = new Map(links.map((link) => [link.ID, link.AccountID]));

  const feeRows: Prisma.financialtransactionsCreateManyInput[] = [];
  const passState = new Map<string, { cost: number; eventDate: Date; storedLastCheck: Date | null }>();
  const touchedAccounts = new Set<string>();

  for (const visit of visits) {
    const pass = passOf.get(passKey(visit.siteID, visit.passID, visit.pastype));
    const stalling = stallingOf.get(visit.stallingsID);
    const accountID = pass?.AccountID ? (topAccountOf.get(pass.AccountID) ?? pass.AccountID) : null;
    if (!pass || !stalling || !accountID) continue;

    const previous = passState.get(pass.ID);
    passState.set(pass.ID, {
      cost: visit.stallingskosten,
      eventDate:
        previous && previous.eventDate.getTime() > visit.eventDate.getTime()
          ? previous.eventDate
          : visit.eventDate,
      storedLastCheck: pass.dateLastCheck,
    });

    const delta = moneyDelta(visit.stallingskosten, bookedOf.get(visit.transactionID) ?? 0);
    if (delta === 0) continue;

    const displayName = sectionDisplayName({
      sectionCount: stalling._count.fietsenstalling_secties,
      sectionTitle: sectionTitleOf.get(visit.sectionExternalId) ?? "",
      stallingTitle: stalling.Title,
      stallingType: stalling.Type,
      city: stalling.Plaats,
      councilName: stalling.contacts_fietsenstallingen_SiteIDTocontacts?.CompanyName ?? null,
    });
    const copy = stallingFeeCopy(delta, bikeTypeOf.get(visit.bikeTypeID) ?? "", stalling.Type, displayName);
    const party = stalling.ExploitantID ?? visit.siteID;
    feeRows.push({
      ID: shortUUID(),
      accountID,
      transactionDate: visit.eventDate,
      amount: -delta,
      btw: vatIncluded(-delta),
      btwPercentage: VAT_PERCENTAGE,
      status: "ok",
      code: copy.code,
      description: copy.description,
      transactionID: visit.transactionID,
      bikeparkID: visit.stallingsID,
      siteID: visit.siteID,
      sourceSiteID: party,
      targetSiteID: party,
      placeID: visit.placeID,
    });
    touchedAccounts.add(accountID);
  }

  if (feeRows.length > 0) {
    await db.financialtransactions.createMany({ data: feeRows });
  }

  const passUpdates = [...passState.entries()].map(([id, state]) => {
    const newer = state.storedLastCheck == null || state.storedLastCheck.getTime() < state.eventDate.getTime();
    return {
      id,
      set: {
        huidigeStallingskosten: state.cost,
        ...(newer ? { dateLastCheck: state.eventDate } : {}),
      },
    };
  });
  if (passUpdates.length > 0) {
    await updateRowsById(db, "accounts_pasids", "ID", passUpdates);
  }
  if (touchedAccounts.size === 0) return;

  const accountIDs = [...touchedAccounts];
  const saldos = await db.$queryRaw<Array<{ accountID: string; stallingstegoed: unknown }>>(
    Prisma.sql`SELECT accountID, stallingstegoed FROM vw_stallingstegoeden WHERE accountID IN (${Prisma.join(accountIDs)})`
  );
  const saldoOf = new Map(saldos.map((row) => [row.accountID, Number(row.stallingstegoed)]));
  await updateRowsById(
    db,
    "accounts",
    "ID",
    accountIDs.map((id) => ({ id, set: { saldo: saldoOf.get(id) ?? 0 } })),
    { dateLastSaldoUpdate: new Date() }
  );
}
