import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { validateUserSession } from "~/utils/server/database-tools";
import { DEFAULT_LATLNG, distanceMeters, latLngAppearSwapped, parseLatLng } from "~/utils/map/coordinates";

const DEFAULT_LOCATION_MAX_METERS = 1;

export type CheckLocationMatch = {
  id: string;
  title: string;
};

export type CheckLocationResponse = {
  allowed: boolean;
  matches: CheckLocationMatch[];
  swapped: boolean;
  error?: string;
};

type CheckLocationBody = {
  standard?: string;
  current?: string;
  stallingId?: string;
  distance?: number;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<CheckLocationResponse>
) {
  if (req.method !== "POST") {
    res.status(405).json({ allowed: false, matches: [], swapped: false, error: "Method Not Allowed" });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  const validationResult = await validateUserSession(session, "any");
  if ("error" in validationResult) {
    res.status(401).json({ allowed: false, matches: [], swapped: false, error: validationResult.error });
    return;
  }

  const body = (req.body ?? {}) as CheckLocationBody;
  const current = parseLatLng(body.current);
  const standard = parseLatLng(body.standard);
  const distance = Number(body.distance);
  const stallingId = typeof body.stallingId === "string" && body.stallingId !== ""
    ? body.stallingId
    : undefined;

  if (current === undefined) {
    res.status(200).json({ allowed: false, matches: [], swapped: false });
    return;
  }

  if (!Number.isFinite(distance) || distance <= 0) {
    res.status(400).json({ allowed: false, matches: [], swapped: false, error: "distance must be a positive number" });
    return;
  }

  const stillOnDefault =
    (standard !== undefined &&
      distanceMeters(current, standard) <= DEFAULT_LOCATION_MAX_METERS) ||
    distanceMeters(current, DEFAULT_LATLNG) <= DEFAULT_LOCATION_MAX_METERS;

  const candidates = await prisma.fietsenstallingen.findMany({
    where: {
      Coordinaten: { not: null },
      Title: { not: "Systeemstalling" },
      Status: { in: ["1", "aanm"] },
      ...(stallingId
        ? { NOT: { OR: [{ ID: stallingId }, { StallingsID: stallingId }] } }
        : {}),
    },
    select: {
      ID: true,
      Title: true,
      Coordinaten: true,
    },
  });

  const matches = candidates
    .map((row) => {
      const other = parseLatLng(row.Coordinaten);
      if (other === undefined) return undefined;
      const meters = distanceMeters(current, other);
      if (meters > distance) return undefined;
      return { id: row.ID, title: row.Title || "Naamloos", meters };
    })
    .filter((row): row is { id: string; title: string; meters: number } => row !== undefined)
    .sort((a, b) => a.meters - b.meters)
    .map(({ id, title }) => ({ id, title }));

  res.status(200).json({
    allowed: !stillOnDefault,
    matches,
    swapped: latLngAppearSwapped(body.current),
  });
}
