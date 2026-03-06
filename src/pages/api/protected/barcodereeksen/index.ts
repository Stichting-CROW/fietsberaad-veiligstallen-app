import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import {
  barcodereeksCreateSchema,
  barcodereeksUitgifteSchema,
  type VSBarcodereeksApi,
  type BarcodereeksType,
} from "~/types/barcodereeksen";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import type { sleutelhangerreeksen_type } from "~/generated/prisma-client";

const VALID_TYPES: BarcodereeksType[] = ["sleutelhanger", "sticker"];

export type BarcodereeksenResponse = {
  data?: VSBarcodereeksApi | VSBarcodereeksApi[];
  error?: string;
};

function toApiType(t: string): sleutelhangerreeksen_type {
  return t === "sticker" ? "sticker" : "sleutelhanger";
}

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

/** Check overlap: [aStart, aEnd] overlaps [bStart, bEnd] (excluding full series where start > end) */
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
  res: NextApiResponse<BarcodereeksenResponse>
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

  switch (req.method) {
    case "GET": {
      const type = (req.query.type as string)?.toLowerCase();
      if (!type || !VALID_TYPES.includes(type as BarcodereeksType)) {
        res.status(400).json({ error: "Ongeldige of ontbrekende type (sleutelhanger of sticker)" });
        return;
      }

      const rows = await prisma.sleutelhangerreeksen.findMany({
        where: { type: toApiType(type) },
        orderBy: [{ published: "desc" }, { rangeStart: "desc" }, { ID: "asc" }],
      });

      // uitgegeven per parentID = sum of (rangeEnd - rangeStart + 1) for children
      const kinderen = await prisma.sleutelhangerreeksen.findMany({
        where: { parentID: { not: null } },
        select: { parentID: true, rangeStart: true, rangeEnd: true },
      });
      const uitgegevenByParent = new Map<number, number>();
      for (const k of kinderen) {
        if (k.parentID == null) continue;
        const size = rangeSize(k.rangeStart, k.rangeEnd);
        uitgegevenByParent.set(k.parentID, (uitgegevenByParent.get(k.parentID) ?? 0) + size);
      }

      const data: VSBarcodereeksApi[] = rows.map((row) => {
        const totaal = rangeSize(row.rangeStart, row.rangeEnd);
        const uitgegeven = uitgegevenByParent.get(row.ID) ?? 0;
        return rowToApi(row, totaal, uitgegeven);
      });

      res.status(200).json({ data });
      break;
    }

    case "POST": {
      const body = req.body as Record<string, unknown>;
      const hasParent =
        typeof body.parentID === "number" &&
        (typeof body.amount === "number" || (body.rangeStart != null && body.rangeEnd != null));

      if (hasParent) {
        // Uitgifte vanuit bestaande voorraad
        const parsed = barcodereeksUitgifteSchema.safeParse(body);
        if (!parsed.success) {
          res.status(400).json({
            error: parsed.error.errors.map((e) => e.message).join(", "),
          });
          return;
        }
        const { parentID, type, label, material, printSample } = parsed.data;

        const parent = await prisma.sleutelhangerreeksen.findUnique({
          where: { ID: parentID },
        });
        if (!parent) {
          res.status(404).json({ error: "Parentreeks niet gevonden" });
          return;
        }
        if (parent.type !== toApiType(type)) {
          res.status(400).json({ error: "Type komt niet overeen met parent" });
          return;
        }

        let childRangeStart: bigint;
        let childRangeEnd: bigint;
        if (parsed.data.rangeStart != null && parsed.data.rangeEnd != null) {
          childRangeStart = BigInt(parsed.data.rangeStart);
          childRangeEnd = BigInt(parsed.data.rangeEnd);
          if (childRangeStart > childRangeEnd) {
            res.status(400).json({ error: "Start van reeks mag niet groter zijn dan eind" });
            return;
          }
          if (childRangeStart < parent.rangeStart || childRangeEnd > parent.rangeEnd) {
            res.status(400).json({
              error: `Reeks moet binnen parent (${parent.rangeStart}-${parent.rangeEnd}) vallen`,
            });
            return;
          }
        } else {
          const amount = parsed.data.amount!;
          const parentSize = rangeSize(parent.rangeStart, parent.rangeEnd);
          if (amount > parentSize) {
            res.status(400).json({
              error: `Aantal (${amount}) is groter dan de beschikbare voorraad (${parentSize})`,
            });
            return;
          }
          childRangeStart = parent.rangeStart;
          childRangeEnd = parent.rangeStart + BigInt(amount) - 1n;
        }

        const beforeSize = childRangeStart > parent.rangeStart ? Number(childRangeStart - parent.rangeStart) : 0;
        const afterSize = childRangeEnd < parent.rangeEnd ? Number(parent.rangeEnd - childRangeEnd) : 0;
        const shrinkFromStart = beforeSize <= afterSize;

        await prisma.$transaction(async (tx) => {
          await tx.sleutelhangerreeksen.update({
            where: { ID: parentID },
            data: shrinkFromStart
              ? { rangeStart: childRangeEnd + 1n }
              : { rangeEnd: childRangeStart - 1n },
          });

          await tx.sleutelhangerreeksen.create({
            data: {
              parentID,
              type: toApiType(type),
              rangeStart: childRangeStart,
              rangeEnd: childRangeEnd,
              label: label ?? null,
              material: material ?? parent.material,
              printSample: printSample ?? parent.printSample,
              published: parent.published,
              created: new Date(),
            },
          });
        });

        const child = await prisma.sleutelhangerreeksen.findFirst({
          where: { parentID, rangeStart: childRangeStart, rangeEnd: childRangeEnd },
          orderBy: { ID: "desc" },
        });
        if (!child) {
          res.status(500).json({ error: "Subreeks aangemaakt maar niet gevonden" });
          return;
        }
        const childTotaal = rangeSize(child.rangeStart, child.rangeEnd);
        res.status(201).json({
          data: rowToApi(child, childTotaal, 0),
        });
        return;
      }

      // New series (no parentID)
      const createParsed = barcodereeksCreateSchema.safeParse(body);
      if (!createParsed.success) {
        res.status(400).json({
          error: createParsed.error.errors.map((e) => e.message).join(", "),
        });
        return;
      }
      const { type, rangeStart: rs, rangeEnd: re, label, material, printSample } = createParsed.data;
      const rangeStart = typeof rs === "string" ? BigInt(rs) : BigInt(rs);
      const rangeEnd = typeof re === "string" ? BigInt(re) : BigInt(re);

      if (rangeStart > rangeEnd) {
        res.status(400).json({ error: "Start van reeks mag niet groter zijn dan eind" });
        return;
      }

      // Overlap check: exclude "full" series (rangeStart > rangeEnd)
      const existing = await prisma.sleutelhangerreeksen.findMany({
        where: { type: toApiType(type), parentID: null },
      });
      for (const row of existing) {
        if (row.rangeStart > row.rangeEnd) continue;
        if (rangesOverlap(rangeStart, rangeEnd, row.rangeStart, row.rangeEnd)) {
          res.status(400).json({
            error: `De nummers van deze reeks overlappen reeks ${row.label ?? "zonder label"}`,
          });
          return;
        }
      }

      const created = await prisma.sleutelhangerreeksen.create({
        data: {
          parentID: null,
          type: toApiType(type),
          rangeStart,
          rangeEnd,
          label: label ?? null,
          material: material ?? null,
          printSample: printSample ?? null,
          published: new Date(),
          created: new Date(),
        },
      });

      const totaal = rangeSize(created.rangeStart, created.rangeEnd);
      res.status(201).json({ data: rowToApi(created, totaal, 0) });
      break;
    }

    default:
      res.status(405).json({ error: "Method Not Allowed" });
  }
}
