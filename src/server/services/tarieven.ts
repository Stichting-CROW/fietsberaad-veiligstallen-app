import { prisma } from "~/server/db";

export type TariefRow = {
  tariefregelID?: number;
  index: number | null;
  tijdsspanne: number | null;
  kosten: number | null;
  stallingsID?: string | null;
  sectieID?: number | null;
  sectionBikeTypeID?: number | null;
  bikeTypeID?: number | null;
};

/**
 * Fetch all sections, section-bike-types, and their capacities for a stalling
 * Only returns sections where isactief is true (sections that are toegestaan)
 */
export async function fetchSectionsForStalling(stallingId: string) {
  const sections = await prisma.fietsenstalling_sectie.findMany({
    where: { 
      fietsenstallingsId: stallingId,
      isactief: true, // Only return sections that are toegestaan
    },
    include: {
      secties_fietstype: {
        include: {
          fietstype: {
            select: {
              ID: true,
              Name: true,
              naamenkelvoud: true,
            },
          },
        },
        orderBy: {
          BikeTypeID: "asc",
        },
      },
    },
    orderBy: {
      sectieId: "asc",
    },
  });

  return sections;
}

/**
 * Load tariefregels grouped by scope
 * Uses different query strategies based on hasUniSectionPrices and hasUniBikeTypePrices flags,
 * matching the SQL queries that resolve IDs through joins.
 */
export async function fetchTariefregelsForHasFlags(
  stallingId: string,
  hasUniSectionPrices: boolean,
  hasUniBikeTypePrices: boolean
) {
  const stalling = await prisma.fietsenstallingen.findFirst({
    where: { ID: stallingId },
    select: {
      ID: true,
      StallingsID: true,
    },
  });

  if (!stalling) {
    console.error("Stalling niet gevonden");
    return [];
  }

  return fetchTariefregelsWithFlags(
    stalling.ID,
    hasUniSectionPrices,
    hasUniBikeTypePrices
  );
}

export async function fetchTariefregelsForStalling(stallingId: string) {
  const stalling = await prisma.fietsenstallingen.findFirst({
    where: { ID: stallingId },
    select: {
      ID: true,
      StallingsID: true,
      hasUniSectionPrices: true,
      hasUniBikeTypePrices: true,
    },
  });

  if (!stalling) {
    console.error("Stalling niet gevonden");
    return { stalling: null, tariffs: [] };
  }

  const tariffs = await fetchTariefregelsWithFlags(
    stalling.ID,
    stalling.hasUniSectionPrices,
    stalling.hasUniBikeTypePrices
  );

  return { stalling, tariffs };
}

async function fetchTariefregelsWithFlags(
  stallingId: string,
  targetHasUniSectionPrices: boolean,
  targetHasUniBikeTypePrices: boolean
): Promise<TariefRow[]> {
  type ResolvedTariefregel = {
    tariefregelID: number;
    resolvedStallingID: string | null;
    resolvedSectieID: number | null;
    resolvedBikeTypeID: number | null;
    resolvedSectionBikeTypeID: number | null;
    index: number | null;
    tijdsspanne: number | null;
    kosten: number | null;
  };

  let resolvedTariefregels: ResolvedTariefregel[] = [];

  if (!targetHasUniBikeTypePrices && !targetHasUniSectionPrices) {
    resolvedTariefregels = await prisma.$queryRaw<ResolvedTariefregel[]>`
      SELECT  
        tr.tariefregelID,
        sec.fietsenstallingsId AS resolvedStallingID,
        sec.sectieId AS resolvedSectieID,
        sft.BikeTypeID AS resolvedBikeTypeID,
        tr.sectionBikeTypeID As resolvedSectionBikeTypeID,
        tr.index,
        tr.tijdsspanne,
        tr.kosten
      FROM 
        tariefregels tr
        LEFT JOIN sectie_fietstype sft ON sft.SectionBiketypeID = tr.sectionBikeTypeID
        LEFT JOIN fietsenstalling_sectie sec ON sec.sectieId = sft.sectieID
      WHERE sec.fietsenstallingsId = ${stallingId}
      ORDER BY tr.index ASC
    `;
  } else if (!targetHasUniBikeTypePrices && targetHasUniSectionPrices) {
    resolvedTariefregels = await prisma.$queryRaw<ResolvedTariefregel[]>`
      SELECT
        tr.tariefregelID,
        sft.StallingsID AS resolvedStallingID,
        NULL AS resolvedSectieID,
        sft.BikeTypeID AS resolvedBikeTypeID,
        NULL As resolvedSectionBikeTypeID,
        tr.index,
        tr.tijdsspanne,
        tr.kosten
      FROM tariefregels tr
      LEFT JOIN sectie_fietstype sft ON sft.SectionBiketypeID = tr.sectionBikeTypeID
      WHERE sft.StallingsID = ${stallingId}
      ORDER BY tr.sectionBikeTypeID ASC, tr.index ASC
    `;
  } else if (targetHasUniBikeTypePrices && !targetHasUniSectionPrices) {
    resolvedTariefregels = await prisma.$queryRaw<ResolvedTariefregel[]>`
      SELECT
        tr.tariefregelID,
        sec.fietsenstallingsId AS resolvedStallingID,
        tr.sectieID AS resolvedSectieID,
        NULL AS resolvedBikeTypeID,
        NULL As resolvedSectionBikeTypeID,
        tr.index,
        tr.tijdsspanne,
        tr.kosten
      FROM tariefregels tr
      LEFT JOIN fietsenstalling_sectie sec ON sec.sectieId = tr.sectieID
      WHERE sec.fietsenstallingsId = ${stallingId}
        AND sec.fietsenstallingsId IS NOT NULL
      ORDER BY tr.sectieID ASC, tr.index ASC
    `;
  } else {
    resolvedTariefregels = await prisma.$queryRaw<ResolvedTariefregel[]>`
      SELECT
        tr.tariefregelID,
        tr.StallingsID AS resolvedStallingID,
        NULL AS resolvedSectieID,
        NULL AS resolvedBikeTypeID,
        NULL As resolvedsectionBikeTypeID,
        tr.index,
        tr.tijdsspanne,
        tr.kosten
      FROM tariefregels tr
      WHERE tr.StallingsID = ${stallingId}
        AND tr.sectieID IS NULL
        AND tr.sectionBikeTypeID IS NULL
      ORDER BY tr.index ASC
    `;
  }

  const tariefregelIDs = resolvedTariefregels.map((r) => r.tariefregelID);
  const allTariefregels =
    tariefregelIDs.length > 0
      ? await prisma.tariefregels.findMany({
          where: {
            tariefregelID: { in: tariefregelIDs },
          },
          orderBy: [
            { index: "asc" },
          ],
        })
      : [];

  const resolvedMap = new Map(
    resolvedTariefregels.map((r) => [
      r.tariefregelID,
      {
        resolvedStallingID: r.resolvedStallingID,
        resolvedSectieID: r.resolvedSectieID,
        resolvedBikeTypeID: r.resolvedBikeTypeID,
      },
    ])
  );

  const allowGlobalBikeTypeTariffs =
    targetHasUniSectionPrices && !targetHasUniBikeTypePrices;

  const tariffs = allTariefregels
    .map((tr) => {
      const resolved = resolvedMap.get(tr.tariefregelID);
      if (!resolved) return null;

      const resolvedStallingID = resolved.resolvedStallingID;
      const resolvedSectieID = resolved.resolvedSectieID;
      const resolvedBikeTypeID = resolved.resolvedBikeTypeID;

      let sectionBikeTypeID: number | null = null;

      if (tr.sectionBikeTypeID !== null) {
        if (resolvedSectieID === null && !allowGlobalBikeTypeTariffs) {
          return null;
        }
        sectionBikeTypeID = tr.sectionBikeTypeID;
      } else if (
        resolvedSectieID === null &&
        !(targetHasUniSectionPrices && targetHasUniBikeTypePrices)
      ) {
        // When not in fully uniform mode, section-level tariffs must resolve to a concrete section
        return null;
      }

      return {
        tariefregelID: tr.tariefregelID,
        index: tr.index ?? null,
        tijdsspanne: tr.tijdsspanne ?? null,
        kosten: tr.kosten ? Number(tr.kosten) : null,
        stallingsID: resolvedStallingID,
        sectieID: resolvedSectieID,
        sectionBikeTypeID,
        bikeTypeID: resolvedBikeTypeID,
      } as TariefRow;
    })
    .filter((t): t is TariefRow => t !== null);

  return tariffs;
}

/**
 * Upsert tariff rows in a transaction (delete + recreate per scope) to keep indices contiguous
 * @param tx - Optional transaction client. If provided, uses existing transaction instead of creating a new one.
 */
export async function upsertTariefregels(
  stallingId: string,
  tariffsByScope: Map<string, TariefRow[]>,
  tx?: Omit<typeof prisma, "$transaction" | "$connect" | "$disconnect" | "$on" | "$use" | "$extends">
) {
  const startTime = Date.now();
  
  // Get StallingsID from the stalling
  const client = tx || prisma;
  const stalling = await client.fietsenstallingen.findFirst({
    where: { ID: stallingId },
    select: { ID: true, StallingsID: true },
  });

  if (!stalling || !stalling.StallingsID) {
    throw new Error("Stalling not found or missing StallingsID");
  }

  // If transaction client is provided, use it directly. Otherwise, create a new transaction.
  const executeInTransaction = async (transactionClient: typeof client) => {
    // Get all sections for this stalling
    const sections = await transactionClient.fietsenstalling_sectie.findMany({
      where: { fietsenstallingsId: stalling.ID },
      select: { sectieId: true },
    });
    const sectionIds = sections.map(s => s.sectieId);
    
    // Get all section bike types for these sections
    const sectionBikeTypes = await transactionClient.sectie_fietstype.findMany({
      where: { 
        OR: [
          { sectieID: { in: sectionIds } },
          { StallingsID: stalling.ID },
        ],
      },
      select: { SectionBiketypeID: true },
    });
    const sectionBikeTypeIds = sectionBikeTypes.map(sbt => sbt.SectionBiketypeID);
    
    // Delete ALL tariefregels for this stalling:
    // 1. Direct association via stallingsID
    // 2. Via sections (sectieID)
    // 3. Via section bike types (sectionBikeTypeID)
    const deleteConditions: any[] = [
      { stallingsID: stalling.ID },
    ];
    
    if (sectionIds.length > 0) {
      deleteConditions.push({ sectieID: { in: sectionIds } });
    }
    
    if (sectionBikeTypeIds.length > 0) {
      deleteConditions.push({ sectionBikeTypeID: { in: sectionBikeTypeIds } });
    }
    
    const deleteResult = await transactionClient.tariefregels.deleteMany({
      where: {
        OR: deleteConditions,
      },
    });

    // Re-insert all tariffs from the payload
    // Process all scopes and rows, skipping only invalid entries (both fields null)
    const newTariefregels: Array<{
      index: number;
      tijdsspanne: number | null;
      kosten: number | null;
      stallingsID: string;
      sectieID?: number | null;
      sectionBikeTypeID?: number | null;
    }> = [];

    for (const [scopeKey, rows] of tariffsByScope.entries()) {
      // Parse scope key: "stalling" | "section:{sectieID}" | "bikeType:{sectionBikeTypeID}"
      const [scopeType, scopeId] = scopeKey.split(":");

      // If scope has no rows (empty array), skip it - all tariffs for this scope were deleted above
      if (!rows || rows.length === 0) {
        continue;
      }

      for (const row of rows) {
        // Skip rows where both tijdsspanne and kosten are null/blank (user wants to delete this tariff)
        // Note: 0 is a valid value (e.g., free first hour), so we only skip when both are null
        if (row.tijdsspanne === null && row.kosten === null) {
          continue;
        }

        // Build tariff data with proper associations
        const tariffData: {
          index: number;
          tijdsspanne: number | null;
          kosten: number | null;
          stallingsID: string;
          sectieID?: number | null;
          sectionBikeTypeID?: number | null;
        } = {
          index: row.index ?? 1,
          tijdsspanne: row.tijdsspanne,
          kosten: row.kosten,
          stallingsID: stalling.ID,
          sectieID: null,
          sectionBikeTypeID: null,
        };

        // Set associations based on scope type
        if (scopeType === "stalling") {
          // Stalling-level tariff: no sectieID or sectionBikeTypeID
          // (already set to null above)
        } else if (scopeType === "section" && scopeId) {
          // Section-level tariff
          tariffData.sectieID = parseInt(scopeId, 10);
        } else if (scopeType === "bikeType" && scopeId) {
          // Bike type-level tariff: need both sectionBikeTypeID and sectieID
          tariffData.sectionBikeTypeID = parseInt(scopeId, 10);
          // Look up the sectieID for this section bike type
          const sectionBikeType = await transactionClient.sectie_fietstype.findFirst({
            where: { SectionBiketypeID: parseInt(scopeId, 10) },
            select: { sectieID: true },
          });
          if (sectionBikeType?.sectieID) {
            tariffData.sectieID = sectionBikeType.sectieID;
          } else {
            console.warn(`[upsertTariefregels] Could not find sectieID for sectionBikeTypeID ${scopeId}, skipping row`);
            continue;
          }
        }

        newTariefregels.push(tariffData);
      }
    }

    if (newTariefregels.length > 0) {
      await transactionClient.tariefregels.createMany({
        data: newTariefregels,
      });
    } else {
      // No new tariffs to create
    }

    const duration = Date.now() - startTime;
    return newTariefregels.length;
  };

  // If transaction client is provided, use it directly. Otherwise, create a new transaction.
  if (tx) {
    return await executeInTransaction(tx);
  } else {
    return await prisma.$transaction(executeInTransaction, {
      timeout: 30000, // 30 seconds - increased from default 5 seconds
      maxWait: 10000, // Wait up to 10 seconds for a transaction slot
    });
  }
}

/**
 * Sync tariff records when a section is created
 */
export async function syncTariefregelsForNewSection(
  sectionId: number,
  stallingId: string
) {
  const stalling = await prisma.fietsenstallingen.findFirst({
    where: { ID: stallingId },
    select: {
      hasUniSectionPrices: true,
      hasUniBikeTypePrices: true,
      ID: true,
      StallingsID: true,
    },
  });

  if (!stalling) {
    return;
  }

  // Previously we created empty tariefregels for every new section (and its bike
  // types). This led to a lot of placeholder rows that had to be cleaned up
  // manually. We now rely on the editing UI to create rows only when needed, so
  // no automatic inserts are performed here anymore.
}

/**
 * Clean up tariff records when a section is deleted
 */
export async function cleanupTariefregelsForDeletedSection(sectionId: number) {
  return await prisma.$transaction(async (tx) => {
    // Get all SectionBiketypeIDs that belonged to this section
    const deletedSectionBikeTypes = await tx.sectie_fietstype.findMany({
      where: { sectieID: sectionId },
      select: { SectionBiketypeID: true },
    });

    // Delete all tariefregels for the deleted section
    await tx.tariefregels.deleteMany({
      where: { sectieID: sectionId },
    });

    // Delete all tariefregels referencing those bike types
    if (deletedSectionBikeTypes.length > 0) {
      await tx.tariefregels.deleteMany({
        where: {
          sectionBikeTypeID: {
            in: deletedSectionBikeTypes.map((sbt) => sbt.SectionBiketypeID),
          },
        },
      });
    }
  }, {
    timeout: 30000, // 30 seconds - increased from default 5 seconds
    maxWait: 10000, // Wait up to 10 seconds for a transaction slot
  });
}

/**
 * Sync tariff records when a bike type is added to a section
 */
export async function syncTariefregelsForNewBikeType(
  sectionBikeTypeID: number,
  stallingId: string
) {
  const stalling = await prisma.fietsenstallingen.findFirst({
    where: { ID: stallingId },
    select: {
      hasUniSectionPrices: true,
      hasUniBikeTypePrices: true,
      ID: true,
      StallingsID: true,
    },
  });

  if (!stalling || stalling.hasUniSectionPrices || stalling.hasUniBikeTypePrices) {
    return;
  }

  // Get sectieID from the sectionBikeType
  const sectionBikeType = await prisma.sectie_fietstype.findFirst({
    where: { SectionBiketypeID: sectionBikeTypeID },
    select: { sectieID: true },
  });

  if (sectionBikeType?.sectieID) {
    // Only create bike-type-specific tariffs if both flags are false
    const bikeTypeTariffs = [1, 2, 3, 4].map((index) => ({
      index,
      tijdsspanne: null,
      kosten: null,
      sectionBikeTypeID,
      sectieID: sectionBikeType.sectieID!,
      stallingsID: stalling.ID,
    }));

    await prisma.tariefregels.createMany({
      data: bikeTypeTariffs,
    });
  }
}

/**
 * Clean up tariff records when a bike type is removed from a section
 */
export async function cleanupTariefregelsForDeletedBikeType(sectionBikeTypeID: number) {
  await prisma.tariefregels.deleteMany({
    where: { sectionBikeTypeID },
  });
}

/**
 * Get tariff validation report for all parkings
 * Returns comma-separated ID lists for each combination and overall totals.
 */
export type TariefValidationReportRow = {
  ID: string;
  Title: string | null;
  Plaats: string | null;
  CompanyName: string | null;
  hasUniSectionPrices: boolean;
  hasUniBikeTypePrices: boolean;
  ids_s_bt: string | null;
  ids_s_none: string | null;
  ids_none_bt: string | null;
  ids_none_none: string | null;
  sectionCount: number;
  sectionsWithTariffsCount: number;
};

type TariefValidationBaseRow = {
  ID: string;
  Title: string | null;
  Plaats: string | null;
  hasUniSectionPrices: 0 | 1;
  hasUniBikeTypePrices: 0 | 1;
  CompanyName: string | null;
  sectionCount: number;
  sectionsWithTariffsCount: number;
};

export async function getTariefValidationReport(): Promise<TariefValidationReportRow[]> {
  const parkings = await prisma.$queryRaw<TariefValidationBaseRow[]>`
    SELECT
      f.ID,
      f.Title,
      f.Plaats,
      f.hasUniSectionPrices,
      f.hasUniBikeTypePrices,
      c.CompanyName,
      COALESCE(section_counts.total_sections, 0) as sectionCount,
      COALESCE(tariff_section_counts.sections_with_tariffs, 0) as sectionsWithTariffsCount
    FROM fietsenstallingen f
    LEFT JOIN contacts c
      ON c.ID = f.SiteID
    LEFT JOIN (
      SELECT 
        fietsenstallingsId,
        COUNT(*) as total_sections
      FROM fietsenstalling_sectie
      WHERE isactief = 1
      GROUP BY fietsenstallingsId
    ) section_counts
      ON section_counts.fietsenstallingsId = f.ID
    LEFT JOIN (
      SELECT 
        tr.stallingsID,
        COUNT(DISTINCT tr.sectieID) as sections_with_tariffs
      FROM tariefregels tr
      WHERE tr.sectieID IS NOT NULL
      GROUP BY tr.stallingsID
    ) tariff_section_counts
      ON tariff_section_counts.stallingsID = f.ID
  `;

  const caseData = await fetchTariefValidationCases();
  return parkings.map((parking) => ({
    ID: parking.ID,
    Title: parking.Title,
    Plaats: parking.Plaats,
    CompanyName: parking.CompanyName,
    hasUniSectionPrices: Boolean(parking.hasUniSectionPrices),
    hasUniBikeTypePrices: Boolean(parking.hasUniBikeTypePrices),
    ids_s_bt: caseData.s_bt.get(parking.ID) ?? null,
    ids_s_none: caseData.s_none.get(parking.ID) ?? null,
    ids_none_bt: caseData.none_bt.get(parking.ID) ?? null,
    ids_none_none: caseData.none_none.get(parking.ID) ?? null,
    sectionCount: Number(parking.sectionCount) || 0,
    sectionsWithTariffsCount: Number(parking.sectionsWithTariffsCount) || 0,
  }));
}

type TariefIdsRow = { ID: string; tariefIDs: string | null };

async function fetchTariefValidationCases() {
  const queries = {
    s_bt: prisma.$queryRaw<TariefIdsRow[]>`
      SELECT f.ID, GROUP_CONCAT(DISTINCT tr.tariefregelID ORDER BY tr.tariefregelID SEPARATOR ',') AS tariefIDs
      FROM fietsenstallingen f
      LEFT JOIN tariefregels tr
        ON tr.stallingsID = f.ID
       AND tr.sectieID IS NULL
       AND tr.sectionBikeTypeID IS NULL
      GROUP BY f.ID
    `,
    s_none: prisma.$queryRaw<TariefIdsRow[]>`
      SELECT f.ID, GROUP_CONCAT(DISTINCT tr.tariefregelID ORDER BY tr.tariefregelID SEPARATOR ',') AS tariefIDs
      FROM fietsenstallingen f
      LEFT JOIN tariefregels tr
        ON tr.sectieID IS NULL
       AND tr.sectionBikeTypeID IS NOT NULL
      LEFT JOIN sectie_fietstype sft
        ON sft.SectionBiketypeID = tr.sectionBikeTypeID
      LEFT JOIN fietsenstalling_sectie sec
        ON sec.sectieId = sft.sectieID
      WHERE sft.StallingsID = f.ID
         OR sec.fietsenstallingsId = f.ID
      GROUP BY f.ID
    `,
    none_bt: prisma.$queryRaw<TariefIdsRow[]>`
      SELECT f.ID, GROUP_CONCAT(DISTINCT tr.tariefregelID ORDER BY tr.tariefregelID SEPARATOR ',') AS tariefIDs
      FROM fietsenstallingen f
      LEFT JOIN fietsenstalling_sectie sec
        ON sec.fietsenstallingsId = f.ID
      LEFT JOIN tariefregels tr
        ON tr.sectieID = sec.sectieId
       AND tr.sectionBikeTypeID IS NULL
      GROUP BY f.ID
    `,
    none_none: prisma.$queryRaw<TariefIdsRow[]>`
      SELECT f.ID, GROUP_CONCAT(DISTINCT tr.tariefregelID ORDER BY tr.tariefregelID SEPARATOR ',') AS tariefIDs
      FROM fietsenstallingen f
      LEFT JOIN fietsenstalling_sectie sec
        ON sec.fietsenstallingsId = f.ID
      LEFT JOIN sectie_fietstype sft
        ON sft.SectieID = sec.sectieId
      LEFT JOIN tariefregels tr
        ON tr.sectionBikeTypeID = sft.SectionBiketypeID
       AND tr.sectieID = sec.sectieId
      GROUP BY f.ID
    `,
  };

  const [s_btRows, s_noneRows, none_btRows, none_noneRows] = await Promise.all([
    queries.s_bt,
    queries.s_none,
    queries.none_bt,
    queries.none_none,
  ]);

  const rowsToMap = (rows: TariefIdsRow[]) =>
    new Map(rows.map((row) => [row.ID, row.tariefIDs]));

  return {
    s_bt: rowsToMap(s_btRows),
    s_none: rowsToMap(s_noneRows),
    none_bt: rowsToMap(none_btRows),
    none_none: rowsToMap(none_noneRows),
  };
}
