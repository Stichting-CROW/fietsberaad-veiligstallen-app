/**
 * Next section external id, ColdFusion generateUniqueSectionExternalIDForBikepark.
 * Empty max → `{stallingsId}_1`. Otherwise the part after the last `_` plus one,
 * without zero padding (`2600_066_1`, not `2600_066_001`).
 * A non-numeric suffix falls back to `_1`, matching the CF try/catch.
 */
export function nextSectionExternalId(
  stallingsId: string,
  maxExternalId: string | null | undefined
): string {
  if (maxExternalId == null || maxExternalId === "") {
    return `${stallingsId}_1`;
  }
  const last = maxExternalId.split("_").pop() ?? "";
  const index = Number(last);
  if (!Number.isFinite(index)) {
    return `${stallingsId}_1`;
  }
  return `${stallingsId}_${index + 1}`;
}

type RawQuery = (sql: string, ...values: unknown[]) => Promise<unknown>;

/**
 * ColdFusion reads MAX(externalId) from non-locker sections and MAX(SectieID)
 * from transacties for the short StallingsID (excluding ids that contain K), then takes the string MAX of those.
 * If that id is already taken (a locker section is excluded from the CF max), the suffix is raised.
 */
export async function generateUniqueSectionExternalId(
  queryRaw: RawQuery,
  fietsenstallingsId: string,
  stallingsId: string
): Promise<string> {
  const rows = (await queryRaw(
    `SELECT MAX(externalId) AS externalId FROM (
       SELECT MAX(externalId) AS externalId
       FROM fietsenstalling_sectie
       WHERE fietsenstallingsId = ?
         AND isKluis = 0
       UNION
       SELECT MAX(SectieID) AS externalId
       FROM transacties
       WHERE FietsenstallingID = ?
         AND (SectieID IS NULL OR SectieID NOT LIKE '%K%')
     ) AS ids`,
    fietsenstallingsId,
    stallingsId
  )) as Array<{ externalId: string | null }>;

  let candidate = nextSectionExternalId(stallingsId, rows[0]?.externalId ?? null);
  for (let attempt = 0; attempt < 1000; attempt++) {
    const taken = (await queryRaw(
      `SELECT externalId FROM fietsenstalling_sectie WHERE externalId = ? LIMIT 1`,
      candidate
    )) as Array<{ externalId: string }>;
    if (taken.length === 0) return candidate;
    candidate = nextSectionExternalId(stallingsId, candidate);
  }
  return candidate;
}
