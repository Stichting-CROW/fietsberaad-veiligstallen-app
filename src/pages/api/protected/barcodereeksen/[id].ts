import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import {
  barcodereeksUpdateSchema,
  type VSBarcodereeksApi,
  type BarcodereeksType,
} from "~/types/barcodereeksen";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import type { sleutelhangerreeksen_type } from "~/generated/prisma-client";

export type BarcodereeksenIdResponse = {
  data?: VSBarcodereeksApi | { suggestedRangeStart: string };
  error?: string;
};

function rowToApi(
  row: {
    ID: number;
    parentID: number | null;
    type: sleutelhangerreeksen_type;
    rangeStart: bigint;
    rangeEnd: bigint;
    label: string | null;
    material: string | null;
    printSample: string | null;
    published: Date | null;
    created: Date | null;
  },
  totaal: number,
  uitgegeven: number
): VSBarcodereeksApi {
  return {
    ID: row.ID,
    parentID: row.parentID,
    type: row.type as BarcodereeksType,
    rangeStart: String(row.rangeStart),
    rangeEnd: String(row.rangeEnd),
    label: row.label,
    material: row.material,
    printSample: row.printSample,
    published: row.published?.toISOString() ?? null,
    created: row.created?.toISOString() ?? null,
    totaal,
    uitgegeven,
  };
}

function rangeSize(start: bigint, end: bigint): number {
  if (start > end) return 0;
  return Number(end - start + 1n);
}

function rangesOverlap(
  aStart: bigint,
  aEnd: bigint,
  bStart: bigint,
  bEnd: bigint
): boolean {
  if (aStart > aEnd || bStart > bEnd) return false;
  return aStart <= bEnd && bStart <= aEnd;
}

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<BarcodereeksenIdResponse>
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Niet ingelogd - geen sessie gevonden" });
    return;
  }

  const hasAdmin = userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_admin);
  const hasSuperadmin = userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin);
  if (!hasAdmin && !hasSuperadmin) {
    res.status(403).json({ error: "Access denied - insufficient permissions" });
    return;
  }

  const id = req.query.id as string;
  const isNew = id === "new";
  const numericId = isNew ? NaN : parseInt(id, 10);

  if (!isNew && (isNaN(numericId) || numericId < 1)) {
    res.status(400).json({ error: "Ongeldig id" });
    return;
  }

  switch (req.method) {
    case "GET": {
      if (isNew) {
        const type = (req.query.type as string)?.toLowerCase();
        if (!type || (type !== "sleutelhanger" && type !== "sticker")) {
          res.status(400).json({ error: "Query type=sleutelhanger of type=sticker verplicht voor .../new" });
          return;
        }
        const typeEnum = type === "sticker" ? "sticker" : "sleutelhanger";
        // ColdFusion behaviour: first series by sort (Published DESC, RangeStart DESC, ID ASC), then suggested = base.rangeEnd + 1 (edit.cfm, getKeychainSeries)[1]
        const firstBySort = await prisma.sleutelhangerreeksen.findFirst({
          where: { type: typeEnum },
          orderBy: [{ published: "desc" }, { rangeStart: "desc" }, { ID: "asc" }],
          select: { rangeEnd: true },
        });
        const suggested = firstBySort?.rangeEnd != null ? firstBySort.rangeEnd + 1n : 1n;
        res.status(200).json({ data: { suggestedRangeStart: String(suggested) } });
        return;
      }

      const row = await prisma.sleutelhangerreeksen.findUnique({
        where: { ID: numericId },
      });
      if (!row) {
        res.status(404).json({ error: "Reeks niet gevonden" });
        return;
      }

      const children = await prisma.sleutelhangerreeksen.findMany({
        where: { parentID: numericId },
        select: { rangeStart: true, rangeEnd: true },
      });
      const uitgegeven = children.reduce(
        (sum, c) => sum + rangeSize(c.rangeStart, c.rangeEnd),
        0
      );
      const totaal = rangeSize(row.rangeStart, row.rangeEnd);
      res.status(200).json({ data: rowToApi(row, totaal, uitgegeven) });
      break;
    }

    case "PUT": {
      const parsed = barcodereeksUpdateSchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({
          error: parsed.error.errors.map((e) => e.message).join(", "),
        });
        return;
      }

      const existing = await prisma.sleutelhangerreeksen.findUnique({
        where: { ID: numericId },
      });
      if (!existing) {
        res.status(404).json({ error: "Reeks niet gevonden" });
        return;
      }

      const rangeStart =
        parsed.data.rangeStart !== undefined
          ? BigInt(parsed.data.rangeStart)
          : existing.rangeStart;
      const rangeEnd =
        parsed.data.rangeEnd !== undefined
          ? BigInt(parsed.data.rangeEnd)
          : existing.rangeEnd;

      if (rangeStart > rangeEnd) {
        res.status(400).json({ error: "Start van reeks mag niet groter zijn dan eind" });
        return;
      }

      const excludeIds = [numericId, ...(existing.parentID != null ? [existing.parentID] : [])];
      const others = await prisma.sleutelhangerreeksen.findMany({
        where: { type: existing.type, ID: { notIn: excludeIds } },
      });
      for (const row of others) {
        if (row.rangeStart > row.rangeEnd) continue;
        if (rangesOverlap(rangeStart, rangeEnd, row.rangeStart, row.rangeEnd)) {
          res.status(400).json({
            error: `De nummers van deze reeks overlappen reeks ${row.label ?? "zonder label"}`,
          });
          return;
        }
      }

      const updated = await prisma.$transaction(async (tx) => {
        // When expanding a child into the parent's range, shrink the parent first (take tickets from parent)
        if (existing.parentID != null) {
          const parent = await tx.sleutelhangerreeksen.findUnique({
            where: { ID: existing.parentID },
          });
          if (parent && parent.rangeStart <= parent.rangeEnd && rangesOverlap(rangeStart, rangeEnd, parent.rangeStart, parent.rangeEnd)) {
            const overlapEnd = rangeEnd < parent.rangeEnd ? rangeEnd : parent.rangeEnd;
            const newParentStart = overlapEnd + 1n;
            await tx.sleutelhangerreeksen.update({
              where: { ID: existing.parentID },
              data: { rangeStart: newParentStart },
            });
          }
        }

        return tx.sleutelhangerreeksen.update({
          where: { ID: numericId },
          data: {
            label: parsed.data.label !== undefined ? parsed.data.label : undefined,
            material: parsed.data.material !== undefined ? parsed.data.material : undefined,
            printSample: parsed.data.printSample !== undefined ? parsed.data.printSample : undefined,
            rangeStart,
            rangeEnd,
          },
        });
      });

      const childrenAfter = await prisma.sleutelhangerreeksen.findMany({
        where: { parentID: numericId },
        select: { rangeStart: true, rangeEnd: true },
      });
      const uitgegevenAfter = childrenAfter.reduce(
        (sum, c) => sum + rangeSize(c.rangeStart, c.rangeEnd),
        0
      );
      const totaalAfter = rangeSize(updated.rangeStart, updated.rangeEnd);
      res.status(200).json({ data: rowToApi(updated, totaalAfter, uitgegevenAfter) });
      break;
    }

    case "DELETE": {
      const existing = await prisma.sleutelhangerreeksen.findUnique({
        where: { ID: numericId },
      });
      if (!existing) {
        res.status(404).json({ error: "Reeks niet gevonden" });
        return;
      }

      const childCount = await prisma.sleutelhangerreeksen.count({
        where: { parentID: numericId },
      });
      if (childCount > 0) {
        res.status(400).json({
          error: "Deze reeks heeft subreeksen en kan niet worden verwijderd",
        });
        return;
      }

      await prisma.sleutelhangerreeksen.delete({
        where: { ID: numericId },
      });
      res.status(204).end();
      break;
    }

    default:
      res.status(405).json({ error: "Method Not Allowed" });
  }
}
