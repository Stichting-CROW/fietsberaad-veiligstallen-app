import { prisma } from "~/server/db";
import type { AdminBulkReservationRow } from "~/types/bulkreserveringen-admin";
import {
  assertNoOverlapWithExisting,
  BULK_ERROR_CAPACITY,
  BULK_ERROR_EXCEPTION_DUPLICATE,
  BULK_ERROR_EXCEPTION_RECURRENT_ONLY,
  BULK_ERROR_EXCEPTION_WEEKDAY,
  buildBulkWindow,
  BulkValidationError,
  parseLocalDateInput,
  findOverlappingIds,
  nextRollForwardState,
  sameCalendarDay,
  startOfLocalDay,
  exceptionMatchesBulkWeekday,
  type BulkHoldLike,
} from "./domain";

export type BulkReservationDto = {
  id: number;
  sectieId: number;
  aantal: number;
  startdatumtijd: string;
  einddatumtijd: string;
  terugkerend: boolean;
  overlap: boolean;
  uitzonderingen: { id: number; datum: string }[];
};

export type SectionBulkBlock = {
  sectieId: number;
  titel: string;
  capacity: number;
  bulkreserveringen: BulkReservationDto[];
};

async function sectionCapacitySum(sectieId: number): Promise<number> {
  const rows = await prisma.sectie_fietstype.findMany({
    where: { sectieID: sectieId },
    select: { Capaciteit: true },
  });
  return rows.reduce((sum, r) => sum + (r.Capaciteit ?? 0), 0);
}

function rowToHold(row: {
  ID: number;
  SectieID: number | null;
  Startdatumtijd: Date | null;
  Einddatumtijd: Date | null;
  Terugkerend: boolean | null;
}): BulkHoldLike | null {
  if (row.SectieID == null || !row.Startdatumtijd || !row.Einddatumtijd) return null;
  return {
    id: row.ID,
    sectieId: row.SectieID,
    start: row.Startdatumtijd,
    end: row.Einddatumtijd,
    recurrent: Boolean(row.Terugkerend),
  };
}

async function loadActiveHoldsForSection(sectieId: number, now: Date): Promise<BulkHoldLike[]> {
  const rows = await prisma.bulkreservering.findMany({
    where: {
      SectieID: sectieId,
      Einddatumtijd: { gte: now },
    },
  });
  return rows.map(rowToHold).filter((h): h is BulkHoldLike => h != null);
}

async function assertSectionBelongsToStalling(sectieId: number, fietsenstallingId: string) {
  const section = await prisma.fietsenstalling_sectie.findFirst({
    where: { sectieId, fietsenstallingsId: fietsenstallingId, isactief: true },
    include: {
      fietsenstalling: { select: { StallingsID: true } },
    },
  });
  if (!section) {
    throw new BulkValidationError("Sectie niet gevonden voor deze stalling");
  }
  return section;
}

export async function listBulkReservationsForStalling(
  fietsenstallingId: string
): Promise<SectionBulkBlock[]> {
  const now = new Date();
  const todayStart = startOfLocalDay(now);
  // Show holds through the end of their calendar day (not only while Einddatumtijd >= now),
  // so beheer can still view/delete today's rows after the time window has passed.
  const listCutoff = todayStart;
  const sections = await prisma.fietsenstalling_sectie.findMany({
    where: { fietsenstallingsId: fietsenstallingId, isactief: true },
    orderBy: { titel: "asc" },
    include: {
      secties_fietstype: { select: { Capaciteit: true } },
    },
  });

  const sectieIds = sections.map((s) => s.sectieId);
  if (sectieIds.length === 0) return [];

  const bulkRows = await prisma.bulkreservering.findMany({
    where: { SectieID: { in: sectieIds }, Einddatumtijd: { gte: listCutoff } },
    orderBy: { Startdatumtijd: "asc" },
  });

  const bulkIds = bulkRows.map((b) => b.ID);
  const exceptionRows =
    bulkIds.length === 0
      ? []
      : await prisma.bulkreserveringuitzondering.findMany({
          where: {
            datum: { gte: todayStart },
            BulkreservationID: { in: bulkIds },
          },
          orderBy: { datum: "asc" },
        });

  const exceptionsByBulk = new Map<number, { id: number; datum: string }[]>();
  for (const ex of exceptionRows) {
    if (ex.BulkreservationID == null || !ex.datum) continue;
    const list = exceptionsByBulk.get(ex.BulkreservationID) ?? [];
    list.push({ id: ex.ID, datum: ex.datum.toISOString().slice(0, 10) });
    exceptionsByBulk.set(ex.BulkreservationID, list);
  }

  const holdsBySection = new Map<number, BulkHoldLike[]>();
  for (const row of bulkRows) {
    const h = rowToHold(row);
    if (!h) continue;
    const list = holdsBySection.get(h.sectieId) ?? [];
    list.push(h);
    holdsBySection.set(h.sectieId, list);
  }

  const overlapIds = new Set<number>();
  for (const holds of holdsBySection.values()) {
    for (const id of findOverlappingIds(holds)) overlapIds.add(id);
  }

  return sections.map((section) => {
    const capacity = (section.secties_fietstype ?? []).reduce(
      (sum, sf) => sum + (sf.Capaciteit ?? 0),
      0
    );
    const sectionBulks = bulkRows.filter((b) => b.SectieID === section.sectieId);
    return {
      sectieId: section.sectieId,
      titel: section.titel,
      capacity,
      bulkreserveringen: sectionBulks.map((b) => ({
        id: b.ID,
        sectieId: b.SectieID!,
        aantal: b.Aantal ?? 0,
        startdatumtijd: b.Startdatumtijd!.toISOString(),
        einddatumtijd: b.Einddatumtijd!.toISOString(),
        terugkerend: Boolean(b.Terugkerend),
        overlap: overlapIds.has(b.ID),
        uitzonderingen: exceptionsByBulk.get(b.ID) ?? [],
      })),
    };
  });
}

export async function createBulkReservation(
  fietsenstallingId: string,
  input: {
    sectieId: number;
    aantal: number;
    startDate: string;
    startTime: string;
    endTime: string;
    terugkerend: boolean;
  }
): Promise<{ id: number }> {
  const section = await assertSectionBelongsToStalling(input.sectieId, fietsenstallingId);
  const capacity = await sectionCapacitySum(input.sectieId);
  if (input.aantal <= 0) {
    throw new BulkValidationError("Aantal is verplicht");
  }
  if (input.aantal > capacity) {
    throw new BulkValidationError(BULK_ERROR_CAPACITY);
  }

  const calendarDate = parseLocalDateInput(input.startDate);
  const { start, end } = buildBulkWindow(calendarDate, input.startTime, input.endTime);
  const now = new Date();
  const candidate: BulkHoldLike = {
    sectieId: input.sectieId,
    start,
    end,
    recurrent: input.terugkerend,
  };
  const existing = await loadActiveHoldsForSection(input.sectieId, now);
  assertNoOverlapWithExisting(candidate, existing);

  const bikeparkExternalId = section.fietsenstalling?.StallingsID ?? null;
  const sectionExternalId = section.externalId ?? null;

  const created = await prisma.bulkreservering.create({
    data: {
      Aantal: input.aantal,
      SectieID: input.sectieId,
      Terugkerend: input.terugkerend,
      Startdatumtijd: start,
      Einddatumtijd: end,
      BikeparkExternalID: bikeparkExternalId,
      SectionExternalID: sectionExternalId,
    },
  });

  return { id: created.ID };
}

export async function deleteBulkReservation(
  fietsenstallingId: string,
  bulkId: number
): Promise<void> {
  const bulk = await prisma.bulkreservering.findUnique({ where: { ID: bulkId } });
  if (!bulk?.SectieID) throw new BulkValidationError("Bulkreservering niet gevonden");
  await assertSectionBelongsToStalling(bulk.SectieID, fietsenstallingId);
  await prisma.bulkreserveringuitzondering.deleteMany({ where: { BulkreservationID: bulkId } });
  await prisma.bulkreservering.delete({ where: { ID: bulkId } });
}

export async function addBulkException(
  fietsenstallingId: string,
  bulkId: number,
  datumIso: string
): Promise<{ id: number }> {
  const bulk = await prisma.bulkreservering.findUnique({ where: { ID: bulkId } });
  if (!bulk?.SectieID || !bulk.Startdatumtijd) {
    throw new BulkValidationError("Bulkreservering niet gevonden");
  }
  if (!bulk.Terugkerend) {
    throw new BulkValidationError(BULK_ERROR_EXCEPTION_RECURRENT_ONLY);
  }
  await assertSectionBelongsToStalling(bulk.SectieID, fietsenstallingId);

  const exceptionDate = new Date(`${datumIso}T12:00:00`);
  if (!exceptionMatchesBulkWeekday(bulk.Startdatumtijd, exceptionDate)) {
    throw new BulkValidationError(BULK_ERROR_EXCEPTION_WEEKDAY);
  }

  const existing = await prisma.bulkreserveringuitzondering.findMany({
    where: { BulkreservationID: bulkId },
  });
  for (const ex of existing) {
    if (ex.datum && sameCalendarDay(ex.datum, exceptionDate)) {
      throw new BulkValidationError(BULK_ERROR_EXCEPTION_DUPLICATE);
    }
  }

  const created = await prisma.bulkreserveringuitzondering.create({
    data: {
      BulkreservationID: bulkId,
      datum: startOfLocalDay(exceptionDate),
    },
  });
  return { id: created.ID };
}

export async function deleteBulkException(
  fietsenstallingId: string,
  exceptionId: number
): Promise<void> {
  const ex = await prisma.bulkreserveringuitzondering.findUnique({ where: { ID: exceptionId } });
  if (!ex?.BulkreservationID) throw new BulkValidationError("Uitzondering niet gevonden");
  const bulk = await prisma.bulkreservering.findUnique({ where: { ID: ex.BulkreservationID } });
  if (!bulk?.SectieID) throw new BulkValidationError("Bulkreservering niet gevonden");
  await assertSectionBelongsToStalling(bulk.SectieID, fietsenstallingId);
  await prisma.bulkreserveringuitzondering.delete({ where: { ID: exceptionId } });
}

export type BulkCronResult = {
  rowsProcessed: number;
  archivesInserted: number;
  rowsUpdated: number;
};

/** Weekly roll-forward with catch-up (plan: loop until end date is today or later). */
export async function runBulkReservationRollForward(now = new Date()): Promise<BulkCronResult> {
  const todayStart = startOfLocalDay(now);
  const expired = await prisma.bulkreservering.findMany({
    where: {
      Terugkerend: true,
      Einddatumtijd: { lt: todayStart },
    },
  });

  let archivesInserted = 0;
  let rowsUpdated = 0;

  for (const row of expired) {
    if (!row.Startdatumtijd || !row.Einddatumtijd) continue;
    let start = row.Startdatumtijd;
    let end = row.Einddatumtijd;

    while (startOfLocalDay(end).getTime() < todayStart.getTime()) {
      const occurrenceDate = startOfLocalDay(start);
      const uitzondering = await prisma.bulkreserveringuitzondering.findFirst({
        where: {
          BulkreservationID: row.ID,
          datum: occurrenceDate,
        },
      });

      if (!uitzondering) {
        await prisma.bulkreservering.create({
          data: {
            Aantal: row.Aantal,
            SectieID: row.SectieID,
            Terugkerend: false,
            Startdatumtijd: start,
            Einddatumtijd: end,
            BikeparkExternalID: row.BikeparkExternalID,
            SectionExternalID: row.SectionExternalID,
          },
        });
        archivesInserted += 1;
      }

      const step = nextRollForwardState(start, end, now);
      if (!step) break;
      start = step.start;
      end = step.end;
    }

    if (start.getTime() !== row.Startdatumtijd.getTime() || end.getTime() !== row.Einddatumtijd.getTime()) {
      await prisma.bulkreservering.update({
        where: { ID: row.ID },
        data: { Startdatumtijd: start, Einddatumtijd: end },
      });
      rowsUpdated += 1;
    }
  }

  return {
    rowsProcessed: expired.length,
    archivesInserted,
    rowsUpdated,
  };
}

/** Fietsberaad superadmin: all rows in bulkreservering with stalling and data-owner context. */
export async function listAllBulkReservationsAdmin(): Promise<AdminBulkReservationRow[]> {
  const now = new Date();
  const rows = await prisma.bulkreservering.findMany({
    orderBy: [{ Startdatumtijd: "desc" }, { ID: "desc" }],
  });
  if (rows.length === 0) return [];

  const sectieIds = [...new Set(rows.map((r) => r.SectieID).filter((id): id is number => id != null))];
  const bulkIds = rows.map((r) => r.ID);

  const [sections, exceptionGroups] = await Promise.all([
    prisma.fietsenstalling_sectie.findMany({
      where: { sectieId: { in: sectieIds } },
      select: {
        sectieId: true,
        titel: true,
        fietsenstallingsId: true,
        fietsenstalling: {
          select: { ID: true, Title: true, StallingsID: true, SiteID: true },
        },
      },
    }),
    prisma.bulkreserveringuitzondering.groupBy({
      by: ["BulkreservationID"],
      where: { BulkreservationID: { in: bulkIds } },
      _count: { _all: true },
    }),
  ]);

  const sectionById = new Map(sections.map((s) => [s.sectieId, s]));
  const siteIds = [
    ...new Set(
      sections
        .map((s) => s.fietsenstalling?.SiteID)
        .filter((id): id is string => id != null && id.length > 0)
    ),
  ];
  const contacts =
    siteIds.length === 0
      ? []
      : await prisma.contacts.findMany({
          where: { ID: { in: siteIds } },
          select: { ID: true, CompanyName: true },
        });
  const ownerBySite = new Map(contacts.map((c) => [c.ID, c.CompanyName ?? null]));
  const exceptionsByBulk = new Map(
    exceptionGroups.map((g) => [g.BulkreservationID, g._count._all])
  );

  return rows.map((r) => {
    const section = r.SectieID != null ? sectionById.get(r.SectieID) : undefined;
    const stalling = section?.fietsenstalling;
    const siteId = stalling?.SiteID ?? null;
    const end = r.Einddatumtijd;
    const actief = end != null && end.getTime() >= now.getTime();
    return {
      id: r.ID,
      aantal: r.Aantal,
      startdatumtijd: r.Startdatumtijd?.toISOString() ?? "",
      einddatumtijd: end?.toISOString() ?? "",
      terugkerend: Boolean(r.Terugkerend),
      sectieId: r.SectieID,
      sectieTitel: section?.titel ?? null,
      stallingId: stalling?.ID ?? section?.fietsenstallingsId ?? null,
      stallingTitle: stalling?.Title ?? null,
      stallingsId: stalling?.StallingsID ?? r.BikeparkExternalID ?? null,
      siteId,
      dataOwnerName: siteId ? ownerBySite.get(siteId) ?? null : null,
      uitzonderingenCount: exceptionsByBulk.get(r.ID) ?? 0,
      actief,
    };
  });
}

export { BulkValidationError } from "./domain";
