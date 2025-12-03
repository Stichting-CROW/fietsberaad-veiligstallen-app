import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";
import { validateUserSession } from "~/utils/server/database-tools";

export interface SyncEvent {
  sectionName: string;
  transactionDate: Date | null;
  ageInDays: number | null;
}

export interface SyncEventsResponse {
  data: SyncEvent[];
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<SyncEventsResponse | { error: string }>
) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  try {
    const { stallingId } = req.query;

    if (!stallingId || typeof stallingId !== "string") {
      return res.status(400).json({ error: "stallingId is required" });
    }

    const validation = await validateUserSession(session);
    if ("error" in validation) {
      return res.status(validation.status).json({ error: validation.error });
    }

    const { sites } = validation;

    const stalling = await prisma.fietsenstallingen.findFirst({
      where: { ID: stallingId },
      select: { SiteID: true, StallingsID: true }
    });

    if (!stalling) {
      return res.status(404).json({ error: "Stalling not found" });
    }

    if (!stalling.SiteID || !sites.includes(stalling.SiteID)) {
      return res.status(403).json({ error: "No access to this stalling" });
    }

    const syncEvents = await prisma.wachtrij_sync.findMany({
      where: {
        bikeparkID: stalling.StallingsID || undefined
      },
      select: {
        sectionID: true,
        transactionDate: true
      },
      orderBy: {
        transactionDate: "desc"
      }
    });

    const sectionIds = syncEvents
      .map(e => e.sectionID)
      .filter((id): id is string => id !== null);

    const sections = await prisma.fietsenstalling_sectie.findMany({
      where: {
        externalId: { in: sectionIds },
        fietsenstallingsId: stallingId
      },
      select: {
        externalId: true,
        titel: true
      }
    });

    const sectionMap = new Map(
      sections.map(s => [s.externalId || "", s.titel])
    );

    const now = new Date();
    const data: SyncEvent[] = syncEvents.map(event => {
      const sectionName = sectionMap.get(event.sectionID || "") || event.sectionID || "Onbekend";
      const transactionDate = event.transactionDate;
      const ageInDays = transactionDate
        ? Math.floor((now.getTime() - transactionDate.getTime()) / (1000 * 60 * 60 * 24))
        : null;

      return {
        sectionName,
        transactionDate,
        ageInDays
      };
    });

    return res.status(200).json({ data });
  } catch (error) {
    console.error("Error fetching sync events:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
}

