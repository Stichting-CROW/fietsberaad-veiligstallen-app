import type { fietsenstallingen, Prisma } from "~/generated/prisma-client";
import { sendOpsMail, mailOrigin } from "~/modules/citizen-accounts/mail";
import { prisma } from "~/server/db";
import type { NSFacilityType, NSLocation } from "~/types/ns-connector";
import { generateID } from "~/utils/server/database-tools";
import { fetchNsPlaces, getNsSubscriptionKey, NS_SYNC_QUERIES, type NsSyncQueryId } from "./client";
import {
  buildLocationCreateFields,
  buildLocationUpdateFields,
  externalIdFromUri,
  typeMapping,
  validateStallingsId,
} from "./mapping";

export type NsSyncFieldChange = { field: string; from: unknown; to: unknown };

export type NsSyncLocationResult = {
  stallingsId: string;
  title: string;
  queryId: NsSyncQueryId;
  action: "created" | "updated" | "skipped" | "error";
  changes?: NsSyncFieldChange[];
  message?: string;
};

export type NsSyncCompletionMail = {
  subject: string;
  html: string;
  sent: boolean;
};

export type NsSyncSummary = {
  dryRun: boolean;
  created: number;
  updated: number;
  skipped: number;
  errors: number;
  aborted: boolean;
  abortReason?: string;
  results: NsSyncLocationResult[];
  completionMails: NsSyncCompletionMail[];
};

type PlannedCreate = {
  kind: "create";
  stallingsId: string;
  title: string;
  queryId: NsSyncQueryId;
  data: Prisma.fietsenstallingenCreateInput;
  previewChanges: NsSyncFieldChange[];
};

type PlannedUpdate = {
  kind: "update";
  stallingsId: string;
  title: string;
  queryId: NsSyncQueryId;
  id: string;
  data: Prisma.fietsenstallingenUpdateInput;
  changes: NsSyncFieldChange[];
};

type PlannedOperation = PlannedCreate | PlannedUpdate;

const NS_SYNC_TX_TIMEOUT_MS = 120_000;

function normalizeComparable(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (typeof value === "boolean") {
    return value;
  }
  return value;
}

function diffUpdate(
  existing: fietsenstallingen,
  update: Record<string, unknown>,
): NsSyncFieldChange[] {
  const changes: NsSyncFieldChange[] = [];
  for (const [field, to] of Object.entries(update)) {
    if (field === "DateModified" || field === "EditorModified") continue;
    const from = (existing as Record<string, unknown>)[field];
    if (normalizeComparable(from) !== normalizeComparable(to)) {
      changes.push({ field, from, to });
    }
  }
  return changes;
}

function locationUri(location: NSLocation): string {
  return location.link?.uri ?? "";
}

export async function syncNsLocations(options: { dryRun: boolean }): Promise<NsSyncSummary> {
  const subscriptionKey = getNsSubscriptionKey();
  if (!subscriptionKey) {
    throw new Error("NS Connector is not configured. NSCONNECTOR_SUBSCRIPTION_KEY is not set.");
  }

  const council = await prisma.contacts.findFirst({
    where: { UrlName: "ns" },
    select: { ID: true },
  });
  if (!council) {
    throw new Error("Council with UrlName 'ns' not found");
  }

  const exploitant = await prisma.contacts.findFirst({
    where: { UrlName: "ns-stations" },
    select: { ID: true },
  });

  const existingRows = await prisma.fietsenstallingen.findMany({
    where: { SiteID: council.ID },
  });
  const byStallingsId = new Map<string, fietsenstallingen>();
  for (const row of existingRows) {
    if (row.StallingsID) {
      byStallingsId.set(row.StallingsID.toLowerCase(), row);
    }
  }

  const now = new Date();
  const results: NsSyncLocationResult[] = [];
  const errorMessages: string[] = [];
  const planned: PlannedOperation[] = [];
  let aborted = false;
  let abortReason: string | undefined;

  outer: for (const query of NS_SYNC_QUERIES) {
    if (aborted) break;

    let facilityTypes: NSFacilityType[];
    try {
      facilityTypes = await fetchNsPlaces(
        subscriptionKey,
        query.params as Record<string, string>,
        query.label,
      );
    } catch (error) {
      aborted = true;
      abortReason = error instanceof Error ? error.message : String(error);
      break;
    }

    for (const facilityType of facilityTypes) {
      if (aborted) break outer;

      let mapping;
      try {
        mapping = typeMapping(facilityType.name);
      } catch (error) {
        aborted = true;
        abortReason = error instanceof Error ? error.message : String(error);
        break outer;
      }

      for (const location of facilityType.locations ?? []) {
        const title = location.name ?? "(unnamed)";
        if (location.lat === undefined || location.lng === undefined) {
          results.push({
            stallingsId: "",
            title,
            queryId: query.id,
            action: "skipped",
            message: "missing lat/lng",
          });
          continue;
        }

        const uri = locationUri(location);
        const stallingsId = externalIdFromUri(uri, mapping.prefix);

        try {
          validateStallingsId(stallingsId);
          const updateFields = buildLocationUpdateFields(location, mapping, now);
          const existing = byStallingsId.get(stallingsId.toLowerCase());

          if (existing) {
            const changes = diffUpdate(existing, updateFields as Record<string, unknown>);
            planned.push({
              kind: "update",
              stallingsId,
              title,
              queryId: query.id,
              id: existing.ID,
              data: updateFields,
              changes,
            });
            results.push({
              stallingsId,
              title,
              queryId: query.id,
              action: "updated",
              changes,
            });
          } else {
            const createFields = buildLocationCreateFields({
              id: generateID(),
              councilId: council.ID,
              exploitantId: exploitant?.ID ?? null,
              stallingsId,
              now,
            });
            const data = { ...createFields, ...updateFields };
            planned.push({
              kind: "create",
              stallingsId,
              title,
              queryId: query.id,
              data,
              previewChanges: Object.entries(data).map(([field, to]) => ({ field, from: null, to })),
            });
            byStallingsId.set(stallingsId.toLowerCase(), {
              StallingsID: stallingsId,
            } as fietsenstallingen);
            results.push({
              stallingsId,
              title,
              queryId: query.id,
              action: "created",
              changes: Object.entries(data).map(([field, to]) => ({ field, from: null, to })),
            });
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          errorMessages.push(`Error NSLocationConnector - ${title} - ${message}`);
          results.push({
            stallingsId,
            title,
            queryId: query.id,
            action: "error",
            message,
          });
        }
      }
    }
  }

  const hasBlockingErrors = errorMessages.length > 0 || aborted;

  if (!options.dryRun && hasBlockingErrors) {
    for (const r of results) {
      if (r.action === "created" || r.action === "updated") {
        r.action = "error";
        r.message =
          errorMessages.length > 0
            ? "not applied (validation errors elsewhere)"
            : "not applied (sync aborted)";
      }
    }
  }

  if (!options.dryRun && !hasBlockingErrors && planned.length > 0) {
    try {
      await prisma.$transaction(
        async (tx) => {
          for (const op of planned) {
            if (op.kind === "update") {
              await tx.fietsenstallingen.update({
                where: { ID: op.id },
                data: op.data,
              });
            } else {
              await tx.fietsenstallingen.create({ data: op.data });
            }
          }
        },
        { timeout: NS_SYNC_TX_TIMEOUT_MS },
      );
    } catch (error) {
      aborted = true;
      abortReason = error instanceof Error ? error.message : String(error);
      errorMessages.push(`Error NSLocationConnector - transaction failed - ${abortReason}`);
      for (const r of results) {
        if (r.action === "created" || r.action === "updated") {
          r.action = "error";
          r.message = "rolled back (transaction failed)";
        }
      }
    }
  }

  const completionMails = buildNsCompletionMails(errorMessages, {
    created: results.filter((r) => r.action === "created").length,
    updated: results.filter((r) => r.action === "updated").length,
    skipped: results.filter((r) => r.action === "skipped").length,
    errors: results.filter((r) => r.action === "error").length,
    aborted,
    abortReason,
  });

  if (!options.dryRun) {
    for (const mail of completionMails) {
      mail.sent = await sendOpsMail(mail.subject, mail.html);
    }
  }

  return {
    dryRun: options.dryRun,
    created: results.filter((r) => r.action === "created").length,
    updated: results.filter((r) => r.action === "updated").length,
    skipped: results.filter((r) => r.action === "skipped").length,
    errors: results.filter((r) => r.action === "error").length,
    aborted,
    abortReason,
    results,
    completionMails,
  };
}

function buildNsCompletionMails(
  errorMessages: string[],
  counts: {
    created: number;
    updated: number;
    skipped: number;
    errors: number;
    aborted: boolean;
    abortReason?: string;
  },
): NsSyncCompletionMail[] {
  const mails: NsSyncCompletionMail[] = [];
  if (errorMessages.length > 0) {
    mails.push({
      subject: `ERROR: ${mailOrigin()} - NSLocationConnector`,
      html: `<ul>${errorMessages.map((m) => `<li>${escapeHtml(m)}</li>`).join("")}</ul>`,
      sent: false,
    });
  }
  const logLines = [
    "Sync NS stallingen",
    `created=${counts.created} updated=${counts.updated} skipped=${counts.skipped} errors=${counts.errors}`,
  ];
  if (counts.aborted) {
    logLines.push(`aborted: ${counts.abortReason ?? "unknown"}`);
  }
  mails.push({
    subject: `LOG: ${mailOrigin()} - Nightly Jobs finished`,
    html: logLines.join("<br/>"),
    sent: false,
  });
  return mails;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
