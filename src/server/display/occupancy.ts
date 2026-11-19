import { prisma } from "~/server/db";
import { bikeparkIsOpened, type OpeningHoursSchedule } from "~/utils/opening-hours";
import { memoFetch } from "./memo";

export type BikeparkInfoSection = {
  open: boolean;
  sectionId: number;
  capacity: number;
  occupation: number;
  occupied: number;
  bulkbezetting: number;
  free: number;
};

export type BikeparkInfoFlat = {
  open: boolean;
  bikeparkID: string;
  capacity: number;
  occupation: number;
  bulkbezetting: number;
  free: number;
};

function sumCapacity(secties: { secties_fietstype: { Capaciteit: number | null }[] }[]): number {
  let total = 0;
  for (const s of secties) {
    for (const sf of s.secties_fietstype ?? []) {
      total += sf.Capaciteit ?? 0;
    }
  }
  return total;
}

async function bulkBySectieIds(sectieIds: number[], open: boolean): Promise<Map<number, number>> {
  const map = new Map<number, number>();
  if (!open || sectieIds.length === 0) return map;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayEnd = new Date(today);
  todayEnd.setDate(todayEnd.getDate() + 1);

  const excepted = await prisma.bulkreserveringuitzondering.findMany({
    where: { datum: { gte: today, lt: todayEnd } },
    select: { BulkreservationID: true },
  });
  const exceptedIds = excepted.map((e) => e.BulkreservationID).filter((id): id is number => id != null);

  const rows = await prisma.bulkreservering.findMany({
    where: {
      SectieID: { in: sectieIds },
      Startdatumtijd: { lte: new Date() },
      Einddatumtijd: { gt: new Date() },
      ...(exceptedIds.length > 0 ? { ID: { notIn: exceptedIds } } : {}),
    },
    select: { SectieID: true, Aantal: true },
    orderBy: { Startdatumtijd: "asc" },
  });

  for (const r of rows) {
    if (r.SectieID != null && !map.has(r.SectieID)) {
      map.set(r.SectieID, r.Aantal ?? 0);
    }
  }
  return map;
}

function openingSchedule(row: {
  Open_ma: Date | null;
  Dicht_ma: Date | null;
  Open_di: Date | null;
  Dicht_di: Date | null;
  Open_wo: Date | null;
  Dicht_wo: Date | null;
  Open_do: Date | null;
  Dicht_do: Date | null;
  Open_vr: Date | null;
  Dicht_vr: Date | null;
  Open_za: Date | null;
  Dicht_za: Date | null;
  Open_zo: Date | null;
  Dicht_zo: Date | null;
}): OpeningHoursSchedule {
  return row;
}

export async function getBikeparkInfo(bikeparkId: string): Promise<BikeparkInfoSection[]> {
  return memoFetch(`bikeparkInfo:${bikeparkId}`, async () => {
    const bikepark = await prisma.fietsenstallingen.findUnique({
      where: { ID: bikeparkId },
      include: {
        fietsenstalling_secties: {
          where: { isactief: true },
          include: { secties_fietstype: true },
        },
      },
    });
    if (!bikepark) return [];

    const isKluisFilter = bikepark.Type === "fietskluizen";
    const secties = bikepark.fietsenstalling_secties.filter((s) =>
      isKluisFilter ? s.isKluis : !s.isKluis
    );
    const open = bikeparkIsOpened(openingSchedule(bikepark), new Date());
    const bulkMap = await bulkBySectieIds(
      secties.map((s) => s.sectieId),
      open
    );

    return secties.map((s) => {
      const capacity = (s.secties_fietstype ?? []).reduce((sum, sf) => sum + (sf.Capaciteit ?? 0), 0);
      const bezet = open ? s.Bezetting : 0;
      const bulk = open ? bulkMap.get(s.sectieId) ?? 0 : 0;
      const occupied = bezet + bulk;
      return {
        open,
        sectionId: s.sectieId,
        capacity,
        occupation: bezet,
        occupied,
        bulkbezetting: bulk,
        free: capacity - bulk - bezet,
      };
    });
  });
}

export async function getBikeparkInfoFlat(bikeparkId: string): Promise<BikeparkInfoFlat | null> {
  const sections = await getBikeparkInfo(bikeparkId);
  if (sections.length === 0) {
    const bikepark = await prisma.fietsenstallingen.findUnique({ where: { ID: bikeparkId } });
    if (!bikepark) return null;
    const open = bikeparkIsOpened(openingSchedule(bikepark), new Date());
    return { open, bikeparkID: bikeparkId, capacity: 0, occupation: 0, bulkbezetting: 0, free: 0 };
  }
  const info = sections.reduce(
    (acc, s) => ({
      open: s.open,
      capacity: acc.capacity + s.capacity,
      occupation: acc.occupation + s.occupation,
      bulkbezetting: acc.bulkbezetting + s.bulkbezetting,
      free: acc.free + s.free,
    }),
    { capacity: 0, occupation: 0, bulkbezetting: 0, free: 0, open: sections[0]!.open }
  );
  return { ...info, bikeparkID: bikeparkId };
}

export async function getBikeparksInfoForSite(
  siteId: string,
  filter: "verwijssysteem" | "overzichten"
): Promise<BikeparkInfoFlat[]> {
  return memoFetch(`bikeparksInfo:${filter}:${siteId}`, async () => {
    const where =
      filter === "verwijssysteem"
        ? { SiteID: siteId, Status: "1", FMS: true, Verwijssysteem: true }
        : { SiteID: siteId, FMS: true, VerwijssysteemOverzichten: true };

    const bikeparks = await prisma.fietsenstallingen.findMany({
      where,
      select: { ID: true },
      orderBy: { Title: "asc" },
    });

    const out: BikeparkInfoFlat[] = [];
    for (const b of bikeparks) {
      const flat = await getBikeparkInfoFlat(b.ID);
      if (flat) out.push(flat);
    }
    return out;
  });
}
