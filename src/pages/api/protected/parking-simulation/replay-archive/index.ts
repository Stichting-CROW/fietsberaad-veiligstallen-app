import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import {
  countArchive,
  replayArchiveBatch,
  resetNewTables,
  resolveBikeparkIDs,
  type ReplayFilter,
  type ReplayKind,
  type ReplaySource,
} from "~/server/services/fms/replay-archive-service";

/**
 * POST /api/protected/parking-simulation/replay-archive
 *
 * Replays archived queue data (wachtrij_*_archive20240915) into the shadow input
 * queues (new_wachtrij_*) via the FMS write service layer, without touching production.
 *
 * Body: { action: "count" | "reset" | "replay", ...filter, kind?, afterId?, batchSize? }
 * - count:  returns archive row counts for the given filter
 * - reset:  clears new_wachtrij_* + new_* output tables (clean slate)
 * - replay: replays ONE batch (ID > afterId) for `kind`; returns lastId + hasMore so the
 *           caller loops until done (avoids serverless time limits on large archives).
 *
 * Fietsberaad superadmin only.
 */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ message: "Niet ingelogd" });
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    return res.status(403).json({ message: "Geen rechten" });
  }

  const body = (req.body ?? {}) as {
    action?: string;
    kind?: string;
    afterId?: number;
    batchSize?: number;
    dataOwnerId?: string;
    stallingId?: string;
    allData?: boolean;
    dateStart?: string;
    dateEnd?: string;
    source?: string;
  };

  const source: ReplaySource = body.source === "archive" ? "archive" : "live";

  try {
    const { ids, label } = await resolveBikeparkIDs({
      dataOwnerId: body.dataOwnerId,
      stallingId: body.stallingId,
    });

    const filter: ReplayFilter = {
      bikeparkIDs: ids,
      dateStart: body.dateStart || undefined,
      dateEnd: body.dateEnd || undefined,
      allData: !!body.allData,
    };

    if (body.action === "count") {
      const counts = await countArchive(filter, source);
      return res.status(200).json({ ok: true, counts, scopeLabel: label });
    }

    if (body.action === "reset") {
      const counts = await resetNewTables();
      return res.status(200).json({ ok: true, reset: counts });
    }

    if (body.action === "replay") {
      const kind = (body.kind === "pasids" ? "pasids" : "transacties") as ReplayKind;
      const result = await replayArchiveBatch({
        kind,
        afterId: Number(body.afterId ?? 0),
        batchSize: Number(body.batchSize ?? 200),
        filter,
        source,
      });
      return res.status(200).json({ ok: true, ...result });
    }

    return res.status(400).json({ message: "Ongeldige action. Kies: count, reset, replay." });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    console.error("[replay-archive] error:", msg);
    return res.status(500).json({ ok: false, message: "Fout: " + msg });
  }
}
