import { prisma } from "~/server/db";

/** Bike type with explicit capacity from veiligstallen config */
export type StallingBikeTypeCategory = {
  bikeTypeID: number;
  capacity: number;
};

/** Place/slot from fietsenstalling_plek */
export type StallingPlace = {
  id: number;
  bikeTypeID: number | null; // null = unknown
};

/** Section from veiligstallen config */
export type StallingSection = {
  sectionid: string;
  sectieId: number;
  biketypes: StallingBikeTypeCategory[];
  places: StallingPlace[];
};

/** Layout for slot creation - from veiligstallen config only */
export type StallingLayout = {
  fietsenstallingId: string;
  /** Total capacity from fietsenstallingen.Capacity (fallback when no per-type capacity) */
  totalCapacity: number;
  sections: StallingSection[];
  /** Bike type IDs with explicit capacity (for display). Empty if no explicit capacity → use "Onbekend" */
  categoriesWithCapacity: number[];
  /** True when no bike types have explicit capacity → show "Onbekend" category */
  hasUnknownCategoryOnly: boolean;
};

/**
 * Get stalling layout from veiligstallen config (fietsenstalling_sectie, sectie_fietstype, fietsenstalling_plek).
 * Only includes bike types with explicit capacity (Toegestaan + Capaciteit > 0).
 * When no bike types have explicit capacity, hasUnknownCategoryOnly = true.
 */
export async function getStallingLayoutFromVeiligstallen(
  locationid: string
): Promise<StallingLayout | null> {
  const stalling = await prisma.fietsenstallingen.findFirst({
    where: {
      OR: [{ StallingsID: locationid }, { ID: locationid }],
      Status: "1",
    },
    select: { ID: true, Capacity: true },
  });
  if (!stalling) return null;

  const secties = await prisma.fietsenstalling_sectie.findMany({
    where: {
      fietsenstallingsId: stalling.ID,
      isactief: true,
    },
    include: {
      secties_fietstype: {
        where: { Toegestaan: true },
        select: { BikeTypeID: true, Capaciteit: true },
      },
    },
    orderBy: { sectieId: "asc" },
  });

  const categoriesWithCapacity = new Set<number>();
  const sections: StallingSection[] = [];

  for (const sectie of secties) {
    const biketypes: StallingBikeTypeCategory[] = sectie.secties_fietstype
      .filter((sf) => sf.Capaciteit != null && sf.Capaciteit > 0 && sf.BikeTypeID != null)
      .map((sf) => ({
        bikeTypeID: sf.BikeTypeID!,
        capacity: sf.Capaciteit!,
      }));

    biketypes.forEach((bt) => categoriesWithCapacity.add(bt.bikeTypeID));

    const plekken = await prisma.fietsenstalling_plek.findMany({
      where: { sectie_id: BigInt(sectie.sectieId), isActief: true },
      include: { plaats_fietstype: true },
      orderBy: { id: "asc" },
    });

    const places: StallingPlace[] = plekken.map((p) => ({
      id: Number(p.id),
      bikeTypeID: p.plaats_fietstype?.fiets_type_id ?? null,
    }));

    const sectionid = sectie.externalId ?? String(sectie.sectieId);
    sections.push({
      sectionid,
      sectieId: sectie.sectieId,
      biketypes,
      places,
    });
  }

  const hasExplicitCapacity = categoriesWithCapacity.size > 0;
  const hasUnknownCategoryOnly = !hasExplicitCapacity;
  const totalCapacity = stalling.Capacity ?? 0;

  return {
    fietsenstallingId: stalling.ID,
    totalCapacity,
    sections,
    categoriesWithCapacity: [...categoriesWithCapacity].sort((a, b) => a - b),
    hasUnknownCategoryOnly,
  };
}

