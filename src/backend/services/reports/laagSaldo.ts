import { Prisma } from "~/generated/prisma-client";
import { prisma } from "~/server/db";
import { type ReportScope } from "~/backend/services/reports/scope";

export type LaagSaldoRegel = { id: string; naam: string; aantal: number };

export type LaagSaldoResultaat = {
  maxSaldo: number;
  stallingen: Array<{ StallingsID: string; Title: string }>;
  stallingsId: string | null;
  regels: LaagSaldoRegel[];
};

/**
 * Port of the `overzichten` page `Saldotekort` (`FietsEnWinGateway.getOccupationByMaxSaldo`):
 * bikes currently parked whose account saldo is below the threshold, per bike park or per section.
 */
export const getLaagSaldo = async (
  scope: ReportScope,
  maxSaldo: number,
  stallingsId?: string,
): Promise<LaagSaldoResultaat> => {
  const stallingen = await prisma.fietsenstallingen.findMany({
    where: {
      Status: "1",
      FMS: true,
      Type: { in: ["bewaakt", "fietskluizen"] },
      StallingsID: { not: null },
      ...(scope.kind === "exploitant" ? { ExploitantID: scope.contactId } : { SiteID: scope.contactId }),
    },
    select: { ID: true, StallingsID: true, Title: true },
    orderBy: { Title: "asc" },
  });
  const lijst = stallingen.map((s) => ({ StallingsID: s.StallingsID ?? "", Title: s.Title ?? "" }));
  const gekozen = stallingsId ? stallingen.find((s) => s.StallingsID === stallingsId) : undefined;

  if (gekozen) {
    const rows = await prisma.$queryRaw<Array<{ id: string; naam: string; aantal: bigint }>>`
      SELECT s.externalId AS id, s.titel AS naam,
        (SELECT COUNT(*) FROM accounts_pasids ap
          INNER JOIN gemeenteaccounts g ON g.ID = ap.AccountID
          INNER JOIN accounts a ON a.ID = g.AccountID
          WHERE a.saldo < ${new Prisma.Decimal(maxSaldo)}
            AND ap.huidigeFietsenstallingId = ${gekozen.StallingsID}
            AND ap.huidigeSectieId = s.externalId) AS aantal
      FROM fietsenstalling_sectie s
      WHERE s.fietsenstallingsId = ${gekozen.ID} AND s.externalId IS NOT NULL
      ORDER BY s.externalId
    `;
    return {
      maxSaldo,
      stallingen: lijst,
      stallingsId: gekozen.StallingsID,
      regels: rows.map((r) => ({ id: r.id, naam: r.naam, aantal: Number(r.aantal) })),
    };
  }

  const ids = lijst.map((s) => s.StallingsID).filter(Boolean);
  if (ids.length === 0) return { maxSaldo, stallingen: lijst, stallingsId: null, regels: [] };

  // One row per stalling, same as getOccupationByMaxSaldo without a selected bikepark.
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; naam: string | null; aantal: bigint }>>(
    `SELECT f.StallingsID AS id, f.Title AS naam,
      (SELECT COUNT(*)
       FROM accounts_pasids ap
       INNER JOIN gemeenteaccounts g ON g.ID = ap.AccountID
       INNER JOIN accounts a ON a.ID = g.AccountID
       WHERE a.saldo < ?
         AND ap.huidigeFietsenstallingId = f.StallingsID) AS aantal
     FROM fietsenstallingen f
     WHERE f.StallingsID IN (${ids.map(() => "?").join(", ")})
     ORDER BY f.Title`,
    maxSaldo,
    ...ids,
  );
  return {
    maxSaldo,
    stallingen: lijst,
    stallingsId: null,
    regels: rows.map((r) => ({ id: r.id, naam: r.naam ?? "", aantal: Number(r.aantal) })),
  };
};
