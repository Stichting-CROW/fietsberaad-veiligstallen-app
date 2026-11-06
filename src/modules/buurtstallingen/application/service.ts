import { prisma } from "~/server/db";
import { isBuurtstallingenEngineEnabled, STALLING_TYPES, type StallingType } from "../config";
import {
  actionLabel,
  addMonths,
  changeOccupationStatus,
  countFree,
  createProposal,
  createReservation,
  initialMailingDate,
  matchWaitingList,
  nextSequence,
  reorderSequence,
  sectionHasOccupation,
  statusLabel,
} from "../domain/engine";
import { logoUrl, renderDocument, type DocumentContext } from "../domain/documents";
import {
  ALLOWED_ACTIONS,
  BIKE_TYPES,
  DomainError,
  bikeTypeFromStored,
  bikeTypeToStored,
  type Occupation,
  type OccupationStatus,
  type Qualification,
  type Section,
  type WaitingListEntry,
  WAITINGLIST_MAIL_MONTHS,
} from "../domain/types";
import { newId, readAction, signAction } from "../auth";
import { declinedMail, expiredMail, reservationMail, stillInterestedMail, terminationMail, waitingListMail } from "./bodies";
import { sendBuurtstallingenMail, sendOpsMail } from "./mail";

const TYPES = [...STALLING_TYPES];

export class EngineDisabledError extends Error {
  constructor() {
    super("Buurtstallingen-schrijfacties staan voor deze organisatie nog op de bestaande reserveringsservice.");
    this.name = "EngineDisabledError";
  }
}

function assertEngine(siteId: string) {
  if (!isBuurtstallingenEngineEnabled(siteId)) throw new EngineDisabledError();
}

function asQualification(value: string | null | undefined): Qualification {
  if (value === "UNDER" || value === "ABOVE" || value === "NONE") return value;
  return "NONE";
}

function asStatus(value: string | null | undefined): Occupation["status"] | null {
  if (value === "RESERVED" || value === "PROPOSED" || value === "OCCUPIED" || value === "CANCELLED") return value;
  return null;
}

type LoadedPlace = {
  id: string;
  title: string;
  bikeTypeIds: number[];
  occupation: Occupation | null;
};

async function loadSections(stallingDbId: string): Promise<Section[]> {
  const sections = await prisma.fietsenstalling_sectie.findMany({
    where: { fietsenstallingsId: stallingDbId },
    orderBy: { sectieId: "asc" },
  });
  const sectionIds = sections.map((section) => BigInt(section.sectieId));
  const places = sectionIds.length
    ? await prisma.fietsenstalling_plek.findMany({
        where: { sectie_id: { in: sectionIds } },
        include: { plaats_fietstype: true, fietsenstalling_plek_bezetting: true },
        orderBy: { id: "asc" },
      })
    : [];
  return sections.map((section) => {
    const sectionPlaces: LoadedPlace[] = places
      .filter((place) => place.sectie_id === BigInt(section.sectieId))
      .map((place) => {
        const occupationRow = place.fietsenstalling_plek_bezetting[0];
        const status = asStatus(occupationRow?.status);
        const bikeTypeId =
          bikeTypeFromStored(place.plaats_fietstype?.fiets_type_id) ??
          bikeTypeFromStored(occupationRow?.fiets_type_id) ??
          1;
        return {
          id: place.id.toString(),
          title: place.titel ?? `Plek ${place.id.toString()}`,
          bikeTypeIds: [bikeTypeId],
          occupation:
            occupationRow && status
              ? {
                  id: occupationRow.bezetting_uuid ?? `${occupationRow.account_id}:${occupationRow.plek_id.toString()}`,
                  accountId: occupationRow.account_id,
                  status,
                  expiryDate: occupationRow.verloopdatum,
                  bikeTypeId: bikeTypeFromStored(occupationRow.fiets_type_id) ?? bikeTypeId,
                  placeId: place.id.toString(),
                }
              : null,
        };
      });
    return {
      id: String(section.sectieId),
      title: section.titel,
      qualification: asQualification(section.qualificatie),
      places: sectionPlaces,
    };
  });
}

async function loadEntries(wachtlijstId: bigint | null): Promise<WaitingListEntry[]> {
  if (wachtlijstId === null) return [];
  const rows = await prisma.wachtlijst_item.findMany({
    where: { wachtlijst_id: wachtlijstId },
    include: { wachtlijst_fietstype: true },
    orderBy: { volg_nummer: "asc" },
  });
  return rows.map((row) => ({
    id: row.wachtlijst_item_uuid ?? String(row.wachtlijst_item_id),
    accountId: row.account_id ?? "",
    qualification: asQualification(row.qualificatie),
    bikeTypeIds: [bikeTypeFromStored(row.wachtlijst_fietstype?.fiets_type_id)].filter(
      (bikeTypeId): bikeTypeId is number => bikeTypeId !== null,
    ),
    sequenceNumber: row.volg_nummer ?? 0,
    creationDate: row.creatie_datum ?? new Date(),
    mailingDate: row.datum_mailing ?? new Date(),
  }));
}

function stallingRefWhere(ref: string) {
  return { OR: [{ ID: ref }, { StallingsID: ref }] };
}

async function requireStalling(siteId: string, stallingId: string) {
  const stalling = await prisma.fietsenstallingen.findFirst({
    where: {
      ...stallingRefWhere(stallingId),
      SiteID: siteId,
      Type: { in: TYPES },
      FMS: true,
    },
  });
  if (!stalling) throw new DomainError("stalling.missing", "Stalling niet gevonden");
  return stalling;
}

async function accountName(accountId: string) {
  return prisma.accounts.findUnique({
    where: { ID: accountId },
    select: {
      ID: true,
      Email: true,
      FirstName: true,
      MiddleName: true,
      LastName: true,
      Phone: true,
      Mobile: true,
      Address: true,
      Address_Nr: true,
      Zip: true,
      City: true,
      Sex: true,
    },
  });
}

function displayName(account: { FirstName: string | null; MiddleName: string | null; LastName: string | null } | null) {
  if (!account) return "";
  return [account.FirstName, account.MiddleName, account.LastName].filter(Boolean).join(" ");
}

function holderDto(account: NonNullable<Awaited<ReturnType<typeof accountName>>> | undefined) {
  if (!account) return null;
  return {
    id: account.ID,
    email: account.Email,
    firstName: account.FirstName,
    middleName: account.MiddleName,
    lastName: account.LastName,
    phone: account.Phone,
    mobile: account.Mobile,
    address: account.Address,
    addressNr: account.Address_Nr,
    zip: account.Zip,
    city: account.City,
    sex: account.Sex,
  };
}

export async function listFacilities(siteId: string, type?: StallingType) {
  const rows = await prisma.fietsenstallingen.findMany({
    where: {
      SiteID: siteId,
      Type: type ? type : { in: TYPES },
      FMS: true,
    },
    orderBy: { Title: "asc" },
    select: { ID: true, Title: true, Type: true, StallingsID: true, Plaats: true, Location: true },
  });
  const result = [];
  for (const row of rows) {
    const sections = await loadSections(row.ID);
    const bikeTypeIds = [...new Set(sections.flatMap((section) => section.places.flatMap((place) => place.bikeTypeIds)))];
    result.push({
      id: row.ID,
      title: row.Title,
      type: row.Type,
      stallingsId: row.StallingsID,
      city: row.Plaats,
      address: row.Location,
      counts: {
        free: sections.reduce((sum, section) => sum + section.places.filter((place) => !place.occupation).length, 0),
        reserved: sections.reduce((sum, section) => sum + section.places.filter((place) => place.occupation?.status === "RESERVED").length, 0),
        proposed: sections.reduce((sum, section) => sum + section.places.filter((place) => place.occupation?.status === "PROPOSED").length, 0),
        occupied: sections.reduce((sum, section) => sum + section.places.filter((place) => place.occupation?.status === "OCCUPIED").length, 0),
      },
      freeByBikeType: bikeTypeIds.map((bikeTypeId) => ({ bikeTypeId, free: countFree(sections, bikeTypeId) })),
    });
  }
  return { engineEnabled: isBuurtstallingenEngineEnabled(siteId), facilities: result };
}

export async function accountWizardRedirectPath(
  urlName: string,
  stallingRef: string,
  wizard: string,
  query: Record<string, string | string[] | undefined>,
): Promise<string | null> {
  const detail = await getPublicDetail(urlName, stallingRef);
  if (!detail) return null;
  const stalling = await prisma.fietsenstallingen.findFirst({
    where: { ...stallingRefWhere(stallingRef), SiteID: detail.council.ID },
    select: { ID: true },
  });
  if (!stalling) return null;
  const params = new URLSearchParams({
    siteId: detail.council.ID,
    parkingId: stalling.ID,
    wizard,
  });
  for (const key of ["fiets", "rek", "soort", "tot", "plaats"] as const) {
    const value = query[key];
    if (typeof value === "string" && value) params.set(key, value);
  }
  return `/account/abonnement?${params.toString()}`;
}

export async function getPublicDetailForAccount(siteId: string, parkingId: string) {
  const council = await prisma.contacts.findFirst({
    where: { ID: siteId, Status: { not: "0" } },
    select: { ID: true, CompanyName: true, UrlName: true },
  });
  if (!council) return null;
  const stalling = await prisma.fietsenstallingen.findFirst({
    where: {
      ID: parkingId,
      SiteID: council.ID,
      Type: { in: TYPES },
      FMS: true,
      Status: "1",
    },
  });
  if (!stalling) return null;
  return buildPublicDetail(council, stalling);
}

export async function getPublicDetail(urlName: string, stallingId: string) {
  const council = await prisma.contacts.findFirst({
    where: { UrlName: urlName, Status: { not: "0" } },
    select: { ID: true, CompanyName: true, UrlName: true },
  });
  if (!council) return null;
  const stalling = await prisma.fietsenstallingen.findFirst({
    where: {
      ...stallingRefWhere(stallingId),
      SiteID: council.ID,
      Type: { in: TYPES },
      FMS: true,
      Status: "1",
    },
  });
  if (!stalling) return null;
  return buildPublicDetail(council, stalling);
}

async function buildPublicDetail(
  council: { ID: string; CompanyName: string | null; UrlName: string | null },
  stalling: { ID: string; StallingsID: string | null; Title: string | null; Type: string | null; Location: string | null; Plaats: string | null },
) {
  const sections = await loadSections(stalling.ID);
  const bikeTypeIds = [...new Set(sections.flatMap((section) => section.places.flatMap((place) => place.bikeTypeIds)))];
  const publicId = stalling.StallingsID ?? stalling.ID;
  return {
    council,
    engineEnabled: isBuurtstallingenEngineEnabled(council.ID),
    stalling: { id: publicId, title: stalling.Title, type: stalling.Type, address: stalling.Location, city: stalling.Plaats },
    qualifications: [...new Set(sections.map((section) => section.qualification))],
    freeByBikeType: bikeTypeIds.map((bikeTypeId) => ({ bikeTypeId, free: countFree(sections, bikeTypeId) })),
    subscriptionTypes: await linkedSubscriptionTypes(stalling.ID),
  };
}

export async function linkedSubscriptionTypes(stallingId: string) {
  const forms = await prisma.abonnementsvorm_fietsenstalling.findMany({
    where: { BikeparkID: stallingId },
    include: { abonnementsvormen: true },
  });
  return forms
    .map((link) => link.abonnementsvormen)
    .filter((form): form is NonNullable<typeof form> => Boolean(form && form.isActief))
    .map((form) => ({ id: form.ID, name: form.naam, price: form.prijs?.toString() ?? null }));
}

/** One linked product is used as-is. Several require the citizen's choice. */
export async function subscriptionTypeForAccept(stallingId: string, chosen: number | null): Promise<number | null> {
  const forms = await linkedSubscriptionTypes(stallingId);
  if (forms.length <= 1) return forms[0]?.id ?? null;
  if (chosen !== null && forms.some((form) => form.id === chosen)) return chosen;
  throw new DomainError("subscription.choice", "Kies een abonnementsvorm");
}

export async function getWorkspace(siteId: string, stallingId: string) {
  const stalling = await requireStalling(siteId, stallingId);
  const sections = await loadSections(stalling.ID);
  const entries = await loadEntries(stalling.wachtlijst_Id);
  const accountIds = [
    ...sections.flatMap((section) => section.places.map((place) => place.occupation?.accountId).filter(Boolean)),
    ...entries.map((entry) => entry.accountId),
  ] as string[];
  const accounts = accountIds.length
    ? await prisma.accounts.findMany({
        where: { ID: { in: [...new Set(accountIds)] } },
        select: {
          ID: true,
          Email: true,
          FirstName: true,
          MiddleName: true,
          LastName: true,
          Phone: true,
          Mobile: true,
          Address: true,
          Address_Nr: true,
          Zip: true,
          City: true,
          Sex: true,
        },
      })
    : [];
  const byId = new Map(accounts.map((account) => [account.ID, account]));
  const forms = await prisma.abonnementsvorm_fietsenstalling.findMany({
    where: { BikeparkID: stalling.ID },
    include: { abonnementsvormen: true },
  });
  return {
    engineEnabled: isBuurtstallingenEngineEnabled(siteId),
    stalling: {
      id: stalling.ID,
      title: stalling.Title,
      type: stalling.Type,
      stallingsId: stalling.StallingsID,
    },
    sections: sections.map((section) => ({
      ...section,
      places: section.places.map((place) => ({
        ...place,
        status: place.occupation?.status ?? "FREE",
        statusLabel: statusLabel(place.occupation?.status ?? "FREE"),
        allowedActions: (ALLOWED_ACTIONS[place.occupation?.status ?? "FREE"] as OccupationStatus[]).map((next) => ({
          status: next,
          label: actionLabel(place.occupation?.status ?? "FREE", next),
        })),
        holder: holderDto(place.occupation ? byId.get(place.occupation.accountId) : undefined),
        holderName: displayName(place.occupation ? byId.get(place.occupation.accountId) ?? null : null),
      })),
    })),
    waitingList: entries.map((entry) => ({
      ...entry,
      holderName: displayName(byId.get(entry.accountId) ?? null),
      email: byId.get(entry.accountId)?.Email ?? null,
    })),
    subscriptionTypes: forms
      .map((link) => link.abonnementsvormen)
      .filter((form): form is NonNullable<typeof form> => Boolean(form))
      .map((form) => ({ id: form.ID, name: form.naam, price: form.prijs?.toString() ?? null, months: form.tijdsduur })),
  };
}

async function ensureWaitingList(stallingId: string, current: bigint | null): Promise<bigint> {
  if (current !== null) return current;
  const created = await prisma.wachtlijst.create({ data: {} });
  await prisma.fietsenstallingen.update({ where: { ID: stallingId }, data: { wachtlijst_Id: created.id } });
  return created.id;
}

async function syncSubscription(input: {
  stalling: { ID: string; StallingsID: string | null; SiteID: string | null; Type: string | null; ExploitantID: string | null };
  placeId: bigint;
  sectionId: bigint;
  accountId: string;
  subscriptionTypeId: number | null;
  paid: boolean;
  active: boolean;
}) {
  const existing = await prisma.abonnementen.findFirst({ where: { plekID: input.placeId, AccountID: input.accountId } });
  if (!input.active) {
    if (existing) {
      await prisma.abonnementen.update({
        where: { ID: existing.ID },
        data: { isActief: false, afgesloten: true, afloopdatum: new Date() },
      });
    }
    return;
  }
  const form = input.subscriptionTypeId
    ? await prisma.abonnementsvormen.findUnique({ where: { ID: input.subscriptionTypeId } })
    : null;
  const start = new Date();
  const end = form?.tijdsduur ? addMonths(start, form.tijdsduur) : null;
  if (existing) {
    await prisma.abonnementen.update({
      where: { ID: existing.ID },
      data: {
        isActief: true,
        isBetaald: input.paid,
        afgesloten: false,
        subscriptiontypeID: input.subscriptionTypeId ?? existing.subscriptiontypeID,
      },
    });
    return;
  }
  if (!input.subscriptionTypeId) {
    await sendOpsMail(
      "Buurtstallingen: abonnement zonder abonnementsvorm",
      `<p>Plek ${input.placeId.toString()} heeft geen abonnementsvorm.</p>`,
    );
    return;
  }
  await prisma.abonnementen.create({
    data: {
      externalID: newId(),
      ingangsdatum: start,
      afloopdatum: end,
      prijsInclBtw: form?.prijs,
      isActief: true,
      isBetaald: input.paid,
      subscriptiontypeID: input.subscriptionTypeId,
      AccountID: input.accountId,
      siteID: input.stalling.SiteID,
      exploitantID: input.stalling.ExploitantID,
      bikeparkID: input.stalling.StallingsID,
      sectionID: input.sectionId,
      plekID: input.placeId,
      type: input.stalling.Type,
      afgesloten: false,
    },
  });
}

async function ccFor(stalling: { ExploitantID: string | null; SiteID: string | null }) {
    if (stalling.ExploitantID) {
    const exploitant = await prisma.contacts.findUnique({ where: { ID: stalling.ExploitantID }, select: { Email1: true } });
    if (exploitant?.Email1) return exploitant.Email1;
  }
  if (stalling.SiteID) {
    const council = await prisma.contacts.findUnique({ where: { ID: stalling.SiteID }, select: { Email1: true } });
    return council?.Email1 ?? null;
  }
  return null;
}

function documentUrl(accountId: string, placeId: string, action: "contract" | "machtiging") {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
  const token = signAction({ accountId, action, targetId: placeId });
  return `${base}/api/buurtstallingen/document?token=${encodeURIComponent(token)}`;
}

async function councilUrlName(siteId: string | null) {
  if (!siteId) return "";
  const council = await prisma.contacts.findUnique({ where: { ID: siteId }, select: { UrlName: true } });
  return council?.UrlName ?? "";
}

export async function reservePlace(input: {
  siteId: string;
  stallingId: string;
  accountId: string;
  qualification: Qualification;
  bikeTypeId: number;
  subscriptionTypeId: number | null;
}) {
  assertEngine(input.siteId);
  const stalling = await requireStalling(input.siteId, input.stallingId);
  const sections = await loadSections(stalling.ID);
  const created = createReservation({
    sections,
    qualification: input.qualification,
    bikeTypeId: input.bikeTypeId,
    accountId: input.accountId,
    now: new Date(),
  });
  await prisma.fietsenstalling_plek_bezetting.create({
    data: {
      account_id: input.accountId,
      plek_id: BigInt(created.placeId),
      bezetting_uuid: crypto.randomUUID(),
      status: "RESERVED",
      verloopdatum: created.expiryDate,
      fiets_type_id: bikeTypeToStored(created.bikeTypeId),
    },
  });
  await syncSubscription({
    stalling,
    placeId: BigInt(created.placeId),
    sectionId: BigInt(created.sectionId),
    accountId: input.accountId,
    subscriptionTypeId: input.subscriptionTypeId,
    paid: false,
    active: true,
  });
  await remindOtherWaitingLists(input.accountId, stalling.ID);
  const account = await accountName(input.accountId);
  if (account?.Email && stalling.FMS) {
    await sendBuurtstallingenMail({
      to: account.Email,
      cc: await ccFor(stalling),
      subject: "Reservering plek buurtstalling/fietstrommel",
      html: reservationMail({
        urlName: await councilUrlName(stalling.SiteID),
        stallingType: stalling.Type ?? "",
        stallingTitle: stalling.Title ?? "",
        expiry: created.expiryDate,
        contractUrl: documentUrl(input.accountId, created.placeId, "contract"),
        machtigingUrl: documentUrl(input.accountId, created.placeId, "machtiging"),
      }),
    });
  }
  return created;
}

export async function joinWaitingList(input: {
  siteId: string;
  stallingId: string;
  accountId: string;
  qualification: Qualification;
  bikeTypeId: number;
}) {
  assertEngine(input.siteId);
  const stalling = await requireStalling(input.siteId, input.stallingId);
  const listId = await ensureWaitingList(stalling.ID, stalling.wachtlijst_Id);
  const entries = await loadEntries(listId);
  const now = new Date();
  const uuid = crypto.randomUUID();
  const sequence = nextSequence(entries);
  const item = await prisma.wachtlijst_item.create({
    data: {
      wachtlijst_item_uuid: uuid,
      qualificatie: input.qualification,
      volg_nummer: sequence,
      account_id: input.accountId,
      wachtlijst_id: listId,
      creatie_datum: now,
      datum_mailing: initialMailingDate(now),
    },
  });
  await prisma.wachtlijst_fietstype.create({
    data: { wachtlijst_id: item.wachtlijst_item_id, fiets_type_id: bikeTypeToStored(input.bikeTypeId) },
  });
  const account = await accountName(input.accountId);
  if (account?.Email && stalling.FMS) {
    await sendBuurtstallingenMail({
      to: account.Email,
      cc: await ccFor(stalling),
      subject: "Plaatsing op wachtlijst",
      html: waitingListMail({
        stallingType: stalling.Type ?? "",
        stallingTitle: stalling.Title ?? "",
        bikeType: BIKE_TYPES[input.bikeTypeId] ?? "fiets",
        sequence,
        preference: input.qualification,
        leaveUrl: `${process.env.NEXT_PUBLIC_SITE_URL ?? ""}/api/buurtstallingen/actie?token=${encodeURIComponent(signAction({ accountId: input.accountId, action: "leave", targetId: uuid }))}`,
      }),
    });
  }
  return { id: uuid, sequenceNumber: sequence };
}

export async function applyStatusChange(input: {
  siteId: string;
  stallingId: string;
  placeId: string;
  next: OccupationStatus;
  subscriptionTypeId?: number | null;
}) {
  assertEngine(input.siteId);
  const stalling = await requireStalling(input.siteId, input.stallingId);
  const sections = await loadSections(stalling.ID);
  const place = sections.flatMap((section) => section.places.map((item) => ({ section, item }))).find((row) => row.item.id === input.placeId);
  if (!place?.item.occupation) throw new DomainError("occupation.missing", "Deze plek is vrij");
  const now = new Date();
  const change = changeOccupationStatus({ occupation: place.item.occupation, next: input.next, now });
  if (change.kind === "removed") {
    await prisma.fietsenstalling_plek_bezetting.delete({
      where: { account_id_plek_id: { account_id: place.item.occupation.accountId, plek_id: BigInt(input.placeId) } },
    });
    await syncSubscription({
      stalling,
      placeId: BigInt(input.placeId),
      sectionId: BigInt(place.section.id),
      accountId: place.item.occupation.accountId,
      subscriptionTypeId: input.subscriptionTypeId ?? null,
      paid: false,
      active: false,
    });
    await offerFreedPlace({ stalling, sections: await loadSections(stalling.ID), placeId: input.placeId });
    const account = await accountName(place.item.occupation.accountId);
    if (account?.Email && stalling.FMS) {
      const urlName = await councilUrlName(stalling.SiteID);
      const subject = change.reason === "expired"
        ? "Reservering verlopen"
        : change.reason === "declined"
          ? "Aanbod afgewezen"
          : "Abonnement beëindigd";
      const html = change.reason === "declined"
        ? declinedMail(stalling.Title ?? "deze stalling")
        : change.reason === "expired"
          ? expiredMail(stalling.Title ?? "deze stalling", place.item.occupation.expiryDate ?? now)
          : change.reason === "released" && change.previous.status === "OCCUPIED"
            ? terminationMail({ urlName, stallingType: stalling.Type ?? "", stallingTitle: stalling.Title ?? "", cancelledOn: now })
            : `<p>${subject} voor ${stalling.Title ?? "deze stalling"}.</p>`;
      await sendBuurtstallingenMail({ to: account.Email, cc: await ccFor(stalling), subject, html });
    }
    return change;
  }
  await prisma.fietsenstalling_plek_bezetting.update({
    where: { account_id_plek_id: { account_id: place.item.occupation.accountId, plek_id: BigInt(input.placeId) } },
    data: { status: change.occupation.status, verloopdatum: change.occupation.expiryDate },
  });
  await syncSubscription({
    stalling,
    placeId: BigInt(input.placeId),
    sectionId: BigInt(place.section.id),
    accountId: place.item.occupation.accountId,
    subscriptionTypeId: input.subscriptionTypeId ?? null,
    paid: change.occupation.status === "OCCUPIED",
    active: true,
  });
  if (change.previousStatus === "PROPOSED" && change.occupation.status === "RESERVED") {
    await remindOtherWaitingLists(place.item.occupation.accountId, stalling.ID);
  }
  if (change.occupation.status === "CANCELLED" && stalling.FMS) {
    const account = await accountName(place.item.occupation.accountId);
    if (account?.Email) {
      await sendBuurtstallingenMail({
        to: account.Email,
        cc: await ccFor(stalling),
        subject: "Opzegging buurtstalling/fietstrommel",
        html: terminationMail({
          urlName: await councilUrlName(stalling.SiteID),
          stallingType: stalling.Type ?? "",
          stallingTitle: stalling.Title ?? "",
          cancelledOn: now,
        }),
      });
    }
  }
  return change;
}

async function offerFreedPlace(input: {
  stalling: { ID: string; Title: string | null; SiteID: string | null; FMS: boolean; wachtlijst_Id: bigint | null; ExploitantID: string | null; StallingsID: string | null; Type: string | null };
  sections: Section[];
  placeId: string;
}) {
  const located = input.sections.flatMap((section) => section.places.map((place) => ({ section, place }))).find((row) => row.place.id === input.placeId);
  if (!located || located.place.occupation) return;
  const entries = await loadEntries(input.stalling.wachtlijst_Id);
  const match = matchWaitingList({ entries, place: located.place, section: located.section });
  if (!match) return;
  const proposal = createProposal({
    sections: input.sections,
    qualification: match.qualification,
    bikeTypeIds: match.bikeTypeIds,
    accountId: match.accountId,
    now: new Date(),
    preferredPlaceId: input.placeId,
  });
  await prisma.fietsenstalling_plek_bezetting.create({
    data: {
      account_id: match.accountId,
      plek_id: BigInt(proposal.placeId),
      bezetting_uuid: crypto.randomUUID(),
      status: "PROPOSED",
      verloopdatum: proposal.expiryDate,
      fiets_type_id: bikeTypeToStored(proposal.bikeTypeId),
    },
  });
  const waitingRow = await prisma.wachtlijst_item.findFirst({
    where: { wachtlijst_item_uuid: match.id },
    select: { wachtlijst_item_id: true },
  });
  if (waitingRow) await deleteWaitingListItem(waitingRow.wachtlijst_item_id);
  const account = await accountName(match.accountId);
  if (account?.Email && input.stalling.FMS) {
    const accept = signAction({ accountId: match.accountId, action: "accept", targetId: proposal.placeId });
    const decline = signAction({ accountId: match.accountId, action: "decline", targetId: proposal.placeId });
    const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
    await sendBuurtstallingenMail({
      to: account.Email,
      cc: await ccFor(input.stalling),
      subject: `Er is plek voor u in ${input.stalling.Title ?? "de stalling"}`,
      html: `<p>Er is een plek vrijgekomen.</p><p><a href="${base}/api/buurtstallingen/actie?token=${accept}">Ja, ik accepteer deze plek.</a></p><p><a href="${base}/api/buurtstallingen/actie?token=${decline}">Nee, haal mij van de wachtlijst.</a></p>`,
    });
  }
}

export async function updateHolder(input: {
  siteId: string;
  stallingId: string;
  accountId: string;
  firstName: string;
  middleName: string;
  lastName: string;
  email: string;
  phone: string;
  mobile: string;
  address: string;
  addressNr: string;
  zip: string;
  city: string;
}) {
  assertEngine(input.siteId);
  await requireStalling(input.siteId, input.stallingId);
  await prisma.accounts.update({
    where: { ID: input.accountId },
    data: {
      FirstName: input.firstName,
      MiddleName: input.middleName,
      LastName: input.lastName,
      Email: input.email,
      Phone: input.phone,
      Mobile: input.mobile,
      Address: input.address,
      Address_Nr: input.addressNr,
      Zip: input.zip,
      City: input.city,
    },
  });
}

export async function renderContract(input: {
  siteId: string;
  stallingId: string;
  placeId: string;
  kind: "contract" | "machtiging";
}) {
  const stalling = await requireStalling(input.siteId, input.stallingId);
  const sections = await loadSections(stalling.ID);
  const place = sections.flatMap((section) => section.places).find((item) => item.id === input.placeId);
  if (!place?.occupation) throw new DomainError("occupation.missing", "Geen bezetting");
  const subscription = await prisma.abonnementen.findFirst({
    where: { plekID: BigInt(input.placeId), AccountID: place.occupation.accountId },
  });
  const form = subscription?.subscriptiontypeID
    ? await prisma.abonnementsvormen.findUnique({ where: { ID: subscription.subscriptiontypeID } })
    : null;
  let templateId = input.kind === "contract" ? form?.contractID : form?.paymentAuthorizationID;
  if (!templateId && input.kind === "contract") {
    const fallback = await prisma.documenttemplates.findFirst({
      where: { siteID: stalling.SiteID, name: "contract_buurtstalling" },
    });
    templateId = fallback?.ID ?? null;
  }
  if (!templateId) throw new DomainError("document.missing", "Geen documentsjabloon gekoppeld");
  const template = await prisma.documenttemplates.findUnique({ where: { ID: templateId } });
  if (!template?.html) throw new DomainError("document.missing", "Documentsjabloon is leeg");
  const account = await accountName(place.occupation.accountId);
  const council = stalling.SiteID
    ? await prisma.contacts.findUnique({
        where: { ID: stalling.SiteID },
        select: { CompanyName: true, CompanyLogo: true },
      })
    : null;
  const exploitant = input.kind === "machtiging" && stalling.ExploitantID
    ? await prisma.contacts.findUnique({
        where: { ID: stalling.ExploitantID },
        select: { CompanyName: true, CompanyLogo: true },
      })
    : null;
  const logoFile = exploitant?.CompanyLogo?.trim() ? exploitant.CompanyLogo : council?.CompanyLogo;
  const logoAlt = exploitant?.CompanyLogo?.trim()
    ? exploitant.CompanyName || "Logo"
    : council?.CompanyName || "Logo";
  const context: DocumentContext = {
    firstName: account?.FirstName,
    middleName: account?.MiddleName,
    lastName: account?.LastName,
    address: account?.Address,
    addressNr: account?.Address_Nr,
    zip: account?.Zip,
    city: account?.City,
    email: account?.Email,
    phone: account?.Mobile || account?.Phone,
    stallingTitle: stalling.Title,
    stallingType: stalling.Type,
    subscriptionName: form?.naam,
    subscriptionPrice: form?.prijs?.toString() ?? null,
    placeTitle: place.title,
    dateLabel: new Date().toLocaleDateString("nl-NL"),
  };
  return {
    html: renderDocument(template.html, context),
    title: template.name ?? input.kind,
    council: council?.CompanyName ?? "",
    logoUrl: logoUrl(logoFile),
    logoAlt,
  };
}

export async function expireDue(now = new Date()) {
  const rows = await prisma.fietsenstalling_plek_bezetting.findMany({
    where: { status: { in: ["RESERVED", "PROPOSED"] }, verloopdatum: { lt: now } },
  });
  let processed = 0;
  for (const row of rows) {
    const place = await prisma.fietsenstalling_plek.findUnique({ where: { id: row.plek_id } });
    if (!place?.sectie_id) continue;
    const section = await prisma.fietsenstalling_sectie.findUnique({ where: { sectieId: Number(place.sectie_id) } });
    if (!section?.fietsenstallingsId) continue;
    const stalling = await prisma.fietsenstallingen.findUnique({ where: { ID: section.fietsenstallingsId } });
    if (!stalling?.SiteID || !isBuurtstallingenEngineEnabled(stalling.SiteID)) continue;
    if (!TYPES.includes(stalling.Type as StallingType)) continue;
    await applyStatusChange({
      siteId: stalling.SiteID,
      stallingId: stalling.ID,
      placeId: row.plek_id.toString(),
      next: "FREE",
    });
    processed += 1;
  }
  return { processed };
}

export async function mailDueWaitingList(now = new Date()) {
  const rows = await prisma.wachtlijst_item.findMany({ where: { datum_mailing: { lt: now } } });
  let processed = 0;
  for (const row of rows) {
    const list = row.wachtlijst_id
      ? await prisma.fietsenstallingen.findFirst({ where: { wachtlijst_Id: row.wachtlijst_id } })
      : null;
    if (!list?.SiteID || !isBuurtstallingenEngineEnabled(list.SiteID) || !list.FMS) continue;
    const account = row.account_id ? await accountName(row.account_id) : null;
    if (account?.Email) {
      const token = signAction({ accountId: account.ID, action: "leave", targetId: row.wachtlijst_item_uuid ?? String(row.wachtlijst_item_id) });
      const base = process.env.NEXT_PUBLIC_SITE_URL ?? "";
      await sendBuurtstallingenMail({
        to: account.Email,
        cc: await ccFor(list),
        subject: "Heeft u nog steeds interesse in deze buurtstalling/fietstrommel?",
        html: `<p>U staat op plaats ${row.volg_nummer ?? "?"} van de wachtlijst van ${list.Title ?? "deze stalling"}.</p><p><a href="${base}/api/buurtstallingen/actie?token=${token}">Ik ben niet langer geïnteresseerd.</a></p>`,
      });
    }
    await prisma.wachtlijst_item.update({
      where: { wachtlijst_item_id: row.wachtlijst_item_id },
      data: { datum_mailing: addMonths(now, WAITINGLIST_MAIL_MONTHS) },
    });
    processed += 1;
  }
  return { processed };
}

export async function moveWaitingList(input: {
  siteId: string;
  stallingId: string;
  entryId: string;
  sequenceNumber: number;
  qualification: Qualification;
}) {
  assertEngine(input.siteId);
  const stalling = await requireStalling(input.siteId, input.stallingId);
  const entries = await loadEntries(stalling.wachtlijst_Id);
  const next = reorderSequence(entries, input.entryId, input.sequenceNumber);
  for (const entry of next) {
    await prisma.wachtlijst_item.updateMany({
      where: { wachtlijst_item_uuid: entry.id },
      data: {
        volg_nummer: entry.sequenceNumber,
        qualificatie: entry.id === input.entryId ? input.qualification : entry.qualification,
      },
    });
  }
}

async function deleteWaitingListItem(itemId: bigint): Promise<void> {
  await prisma.$transaction([
    prisma.wachtlijst_fietstype.deleteMany({ where: { wachtlijst_id: itemId } }),
    prisma.wachtlijst_item.delete({ where: { wachtlijst_item_id: itemId } }),
  ]);
}

export async function removeWaitingListEntry(siteId: string, stallingId: string, entryId: string) {
  assertEngine(siteId);
  const stalling = await requireStalling(siteId, stallingId);
  const item = await prisma.wachtlijst_item.findFirst({
    where: { wachtlijst_item_uuid: entryId, wachtlijst_id: stalling.wachtlijst_Id ?? undefined },
    select: { wachtlijst_item_id: true },
  });
  if (!item) return;
  await deleteWaitingListItem(item.wachtlijst_item_id);
}

export async function swapPlaces(siteId: string, stallingId: string, placeIdA: string, placeIdB: string) {
  assertEngine(siteId);
  const stalling = await requireStalling(siteId, stallingId);
  const sections = await loadSections(stalling.ID);
  const a = sections.flatMap((section) => section.places).find((place) => place.id === placeIdA);
  const b = sections.flatMap((section) => section.places).find((place) => place.id === placeIdB);
  if (!a?.occupation || !b?.occupation) throw new DomainError("swap", "Beide plekken moeten bezet zijn");
  await prisma.$transaction(async (tx) => {
    await tx.fietsenstalling_plek_bezetting.delete({
      where: { account_id_plek_id: { account_id: a.occupation!.accountId, plek_id: BigInt(placeIdA) } },
    });
    await tx.fietsenstalling_plek_bezetting.delete({
      where: { account_id_plek_id: { account_id: b.occupation!.accountId, plek_id: BigInt(placeIdB) } },
    });
    await tx.fietsenstalling_plek_bezetting.create({
      data: {
        account_id: a.occupation!.accountId,
        plek_id: BigInt(placeIdB),
        bezetting_uuid: crypto.randomUUID(),
        status: a.occupation!.status,
        verloopdatum: a.occupation!.expiryDate,
        fiets_type_id: bikeTypeToStored(a.occupation!.bikeTypeId),
      },
    });
    await tx.fietsenstalling_plek_bezetting.create({
      data: {
        account_id: b.occupation!.accountId,
        plek_id: BigInt(placeIdA),
        bezetting_uuid: crypto.randomUUID(),
        status: b.occupation!.status,
        verloopdatum: b.occupation!.expiryDate,
        fiets_type_id: bikeTypeToStored(b.occupation!.bikeTypeId),
      },
    });
    await tx.abonnementen.updateMany({
      where: { plekID: BigInt(placeIdA), AccountID: a.occupation!.accountId },
      data: { plekID: BigInt(placeIdB) },
    });
    await tx.abonnementen.updateMany({
      where: { plekID: BigInt(placeIdB), AccountID: b.occupation!.accountId },
      data: { plekID: BigInt(placeIdA) },
    });
  });
}

export async function searchHolders(siteId: string, query: string) {
  const q = query.trim();
  if (q.length < 2) return [];
  const accounts = await prisma.accounts.findMany({
    where: {
      OR: [{ Email: { contains: q } }, { LastName: { contains: q } }, { FirstName: { contains: q } }],
    },
    take: 40,
    select: { ID: true, Email: true, FirstName: true, MiddleName: true, LastName: true },
  });
  if (accounts.length === 0) return [];
  const links = await prisma.gemeenteaccounts.findMany({
    where: { SiteID: siteId, AccountID: { in: accounts.map((account) => account.ID) } },
    select: { AccountID: true },
  });
  const allowed = new Set(links.map((link) => link.AccountID));
  return accounts
    .filter((account) => allowed.has(account.ID))
    .slice(0, 20)
    .map((account) => ({
      id: account.ID,
      email: account.Email,
      name: displayName(account),
    }));
}

export async function syncSectionPlaces(sectionId: number): Promise<void> {
  const section = await prisma.fietsenstalling_sectie.findUnique({ where: { sectieId: sectionId } });
  if (!section?.fietsenstallingsId) return;
  const stalling = await prisma.fietsenstallingen.findUnique({ where: { ID: section.fietsenstallingsId } });
  if (!stalling?.SiteID || !TYPES.includes(stalling.Type as StallingType)) return;
  if (!isBuurtstallingenEngineEnabled(stalling.SiteID)) return;
  const capacities = await prisma.sectie_fietstype.findMany({ where: { sectieID: sectionId, Toegestaan: true } });
  for (const capacity of capacities) {
    if (!capacity.BikeTypeID) continue;
    const target = capacity.Capaciteit ?? 0;
    const places = await prisma.fietsenstalling_plek.findMany({
      where: { sectie_id: BigInt(sectionId) },
      include: { plaats_fietstype: true, fietsenstalling_plek_bezetting: true },
      orderBy: { id: "desc" },
    });
    const storedType = bikeTypeToStored(capacity.BikeTypeID);
    const ofType = places.filter((place) => place.plaats_fietstype?.fiets_type_id === storedType);
    if (ofType.length > target) {
      const removable = ofType.filter((place) => place.fietsenstalling_plek_bezetting.length === 0);
      const occupied = ofType.length - removable.length;
      if (occupied > target) {
        throw new DomainError("capacity", "Capaciteit kan niet lager dan het aantal bezette plekken");
      }
      for (const place of removable.slice(0, ofType.length - target)) {
        await prisma.fietsenstalling_plek.delete({ where: { id: place.id } });
      }
    }
    for (let index = ofType.length; index < target; index += 1) {
      const existing = await prisma.fietsenstalling_plek.findMany({
        where: { sectie_id: BigInt(sectionId) },
        select: { titel: true },
      });
      let number = 1;
      for (const row of existing) {
        const match = /Plek:\s*(\d+)/.exec(row.titel ?? "");
        if (match) number = Math.max(number, Number(match[1]) + 1);
      }
      const created = await prisma.fietsenstalling_plek.create({
        data: {
          plek_uuid: crypto.randomUUID(),
          sectie_id: BigInt(sectionId),
          titel: `Plek: ${number}`,
          isActief: true,
        },
      });
      await prisma.plaats_fietstype.create({
        data: { plaats_id: created.id, fiets_type_id: storedType },
      });
      const sections = await loadSections(stalling.ID);
      await offerFreedPlace({ stalling, sections, placeId: created.id.toString() });
    }
  }
}

export async function assertSectionDeletable(sectionId: number): Promise<void> {
  const section = await prisma.fietsenstalling_sectie.findUnique({ where: { sectieId: sectionId } });
  if (!section?.fietsenstallingsId) return;
  const stalling = await prisma.fietsenstallingen.findUnique({ where: { ID: section.fietsenstallingsId } });
  if (!stalling || !TYPES.includes(stalling.Type as StallingType)) return;
  const loaded = await loadSections(stalling.ID);
  const found = loaded.find((item) => item.id === String(sectionId));
  if (found && sectionHasOccupation(found)) {
    throw new DomainError("section.occupied", "Sectie heeft nog gereserveerde, aangeboden of bezette plekken");
  }
}

export async function handleSignedAction(token: string, chosenSubscriptionTypeId: number | null = null) {
  const action = readAction(token);
  if (!action || action.action === "contract" || action.action === "machtiging") {
    throw new DomainError("link", "Deze link is ongeldig of verlopen");
  }
  if (action.action === "leave") {
    const item = await prisma.wachtlijst_item.findFirst({ where: { wachtlijst_item_uuid: action.targetId, account_id: action.accountId } });
    if (!item?.wachtlijst_id) throw new DomainError("waitinglist.missing", "Wachtlijstregel niet gevonden");
    const stalling = await prisma.fietsenstallingen.findFirst({ where: { wachtlijst_Id: item.wachtlijst_id } });
    if (!stalling?.SiteID) throw new DomainError("stalling.missing", "Stalling niet gevonden");
    assertEngine(stalling.SiteID);
    await deleteWaitingListItem(item.wachtlijst_item_id);
    const account = await accountName(action.accountId);
    if (account?.Email && stalling.FMS) {
      await sendBuurtstallingenMail({
        to: account.Email,
        cc: await ccFor(stalling),
        subject: "U bent van de wachtlijst verwijderd",
        html: `<p>U staat niet langer op de wachtlijst van ${stalling.Title ?? "deze stalling"}.</p>`,
      });
    }
    return { message: "U bent van de wachtlijst gehaald." };
  }
  const occupation = await prisma.fietsenstalling_plek_bezetting.findFirst({
    where: { plek_id: BigInt(action.targetId), account_id: action.accountId, status: "PROPOSED" },
  });
  if (!occupation) throw new DomainError("occupation.missing", "Dit aanbod is niet meer beschikbaar");
  const place = await prisma.fietsenstalling_plek.findUnique({ where: { id: occupation.plek_id } });
  const section = place?.sectie_id
    ? await prisma.fietsenstalling_sectie.findUnique({ where: { sectieId: Number(place.sectie_id) } })
    : null;
  if (!section?.fietsenstallingsId) throw new DomainError("stalling.missing", "Stalling niet gevonden");
  const stalling = await prisma.fietsenstallingen.findUnique({ where: { ID: section.fietsenstallingsId } });
  if (!stalling?.SiteID) throw new DomainError("stalling.missing", "Stalling niet gevonden");
  if (action.action === "accept") {
    const forms = await linkedSubscriptionTypes(stalling.ID);
    if (forms.length > 1 && !forms.some((form) => form.id === chosenSubscriptionTypeId)) {
      return { message: "Kies een abonnementsvorm", choices: forms };
    }
  }
  const subscriptionTypeId = action.action === "accept"
    ? await subscriptionTypeForAccept(stalling.ID, chosenSubscriptionTypeId)
    : undefined;
  await applyStatusChange({
    siteId: stalling.SiteID,
    stallingId: stalling.ID,
    placeId: action.targetId,
    next: action.action === "accept" ? "RESERVED" : "FREE",
    subscriptionTypeId,
  });
  return { message: action.action === "accept" ? "De plek is voor u gereserveerd." : "Het aanbod is afgewezen." };
}

function salutation(sex: string | null | undefined): string {
  const value = sex?.trim().toLowerCase();
  if (value === "man" || value === "m") return "De heer";
  if (value === "vrouw" || value === "v") return "Mevrouw";
  return "";
}

function rekPreference(qualification: string | null | undefined): string {
  return qualification === "NONE" ? "Geen voorkeur" : "Onderrek";
}

function stamp(date: Date | null | undefined): string {
  if (!date) return "";
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

async function recordExport(siteId: string, kind: string, type: StallingType, rows: number) {
  await prisma.rapportageinfo.create({
    data: {
      name: `buurtstallingen-${kind}`,
      type: "CSV",
      gemeenteID: siteId,
      info: `${type}: ${rows} rijen`,
    },
  });
}

async function placeIdsFor(stallingId: string): Promise<bigint[]> {
  const sections = await prisma.fietsenstalling_sectie.findMany({
    where: { fietsenstallingsId: stallingId },
    select: { sectieId: true },
  });
  if (sections.length === 0) return [];
  const places = await prisma.fietsenstalling_plek.findMany({
    where: { sectie_id: { in: sections.map((section) => BigInt(section.sectieId)) } },
    select: { id: true },
  });
  return places.map((place) => place.id);
}

/** Same columns as reports_csv.buurtstallingen: capacity, paid occupancy, new, cancellations, waiting. */
export async function monthlyReport(siteId: string, now = new Date()) {
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const stallings = await prisma.fietsenstallingen.findMany({
    where: { SiteID: siteId, Type: { in: TYPES }, FMS: true },
    orderBy: [{ Type: "asc" }, { StallingsID: "asc" }],
  });
  const rows = [];
  for (const stalling of stallings) {
    const placeIds = await placeIdsFor(stalling.ID);
    const paid = { plekID: { in: placeIds }, isBetaald: true };
    const occupied = placeIds.length
      ? await prisma.abonnementen.count({
          where: { ...paid, ingangsdatum: { lte: now }, OR: [{ afloopdatum: null }, { afloopdatum: { gt: now } }] },
        })
      : 0;
    const created = placeIds.length
      ? await prisma.abonnementen.count({ where: { ...paid, ingangsdatum: { gte: monthStart, lt: nextMonth } } })
      : 0;
    const cancelled = placeIds.length
      ? await prisma.abonnementen.count({ where: { ...paid, afloopdatum: { gte: monthStart, lt: nextMonth } } })
      : 0;
    const waiting = stalling.wachtlijst_Id
      ? await prisma.wachtlijst_item.count({ where: { wachtlijst_id: stalling.wachtlijst_Id } })
      : 0;
    rows.push({
      stallingsId: stalling.StallingsID,
      externalId: stalling.StallingsIDExtern,
      title: stalling.Title,
      type: stalling.Type,
      capacity: placeIds.length,
      occupied,
      occupancyRate: placeIds.length === 0 ? 0 : Math.round((occupied / placeIds.length) * 100),
      created,
      cancelled,
      waiting,
    });
  }
  return rows;
}

export async function waitingListExport(siteId: string, type: StallingType) {
  const stallings = await prisma.fietsenstallingen.findMany({
    where: { SiteID: siteId, Type: type, FMS: true, wachtlijst_Id: { not: null } },
    select: { Title: true, StallingsID: true, wachtlijst_Id: true },
  });
  const rows = [];
  for (const stalling of stallings) {
    if (stalling.wachtlijst_Id === null) continue;
    const items = await prisma.wachtlijst_item.findMany({
      where: { wachtlijst_id: stalling.wachtlijst_Id },
      orderBy: { volg_nummer: "asc" },
    });
    for (const item of items) {
      const account = item.account_id ? await accountName(item.account_id) : null;
      rows.push({
        stallingsId: stalling.StallingsID,
        title: stalling.Title,
        sequence: item.volg_nummer,
        preference: rekPreference(item.qualificatie),
        email: account?.Email ?? "",
        firstName: account?.FirstName ?? "",
        middleName: account?.MiddleName ?? "",
        lastName: account?.LastName ?? "",
        phone: account?.Phone ?? "",
        mobile: account?.Mobile ?? "",
        since: stamp(item.creatie_datum),
      });
    }
  }
  rows.sort((left, right) => (left.title ?? "").localeCompare(right.title ?? "") || (left.sequence ?? 0) - (right.sequence ?? 0));
  await recordExport(siteId, "wachtlijst", type, rows.length);
  return rows;
}

export async function occupantExport(siteId: string, type: StallingType) {
  const stallings = await prisma.fietsenstallingen.findMany({
    where: { SiteID: siteId, Type: type, FMS: true },
    select: { ID: true, StallingsID: true, Title: true },
  });
  const rows = [];
  for (const stalling of stallings) {
    const sections = await prisma.fietsenstalling_sectie.findMany({
      where: { fietsenstallingsId: stalling.ID },
      select: { sectieId: true, externalId: true, titel: true },
    });
    for (const section of sections) {
      const places = await prisma.fietsenstalling_plek.findMany({
        where: { sectie_id: BigInt(section.sectieId) },
        select: { id: true, titel: true },
      });
      if (places.length === 0) continue;
      const occupations = await prisma.fietsenstalling_plek_bezetting.findMany({
        where: { plek_id: { in: places.map((place) => place.id) } },
      });
      for (const occupation of occupations) {
        const account = await accountName(occupation.account_id);
        const place = places.find((item) => item.id === occupation.plek_id);
        rows.push({
          email: account?.Email ?? "",
          salutation: salutation(account?.Sex),
          name: displayName(account),
          stallingsId: stalling.StallingsID,
          stallingTitle: stalling.Title,
          sectionId: section.externalId,
          sectionTitle: section.titel,
          placeTitle: place?.titel ?? "",
        });
      }
    }
  }
  await recordExport(siteId, "gebruikers", type, rows.length);
  return rows;
}

async function remindOtherWaitingLists(accountId: string, exceptStallingId: string) {
  const items = await prisma.wachtlijst_item.findMany({ where: { account_id: accountId } });
  const account = await accountName(accountId);
  for (const item of items) {
    if (item.wachtlijst_id === null) continue;
    const other = await prisma.fietsenstallingen.findFirst({ where: { wachtlijst_Id: item.wachtlijst_id } });
    if (!other?.SiteID || other.ID === exceptStallingId || !isBuurtstallingenEngineEnabled(other.SiteID)) continue;
    await prisma.wachtlijst_item.update({
      where: { wachtlijst_item_id: item.wachtlijst_item_id },
      data: { datum_mailing: addMonths(new Date(), WAITINGLIST_MAIL_MONTHS) },
    });
    if (account?.Email && other.FMS) {
      await sendBuurtstallingenMail({
        to: account.Email,
        cc: await ccFor(other),
        subject: "Heeft u nog steeds interesse in deze buurtstalling/fietstrommel?",
        html: stillInterestedMail(other.Title ?? "deze stalling"),
      });
    }
  }
}

export async function listExpiredCancellations(siteId: string) {
  const stallings = await prisma.fietsenstallingen.findMany({
    where: { SiteID: siteId, Type: { in: TYPES }, FMS: true },
    select: { ID: true, Title: true },
  });
  if (stallings.length === 0) return [];
  const sections = await prisma.fietsenstalling_sectie.findMany({
    where: { fietsenstallingsId: { in: stallings.map((stalling) => stalling.ID) } },
  });
  const places = sections.length
    ? await prisma.fietsenstalling_plek.findMany({
        where: { sectie_id: { in: sections.map((section) => BigInt(section.sectieId)) } },
        include: { fietsenstalling_plek_bezetting: true },
      })
    : [];
  const now = Date.now();
  const accountIds = places.flatMap((place) => place.fietsenstalling_plek_bezetting.map((row) => row.account_id));
  const accounts = accountIds.length
    ? await prisma.accounts.findMany({
        where: { ID: { in: [...new Set(accountIds)] } },
        select: { ID: true, FirstName: true, MiddleName: true, LastName: true },
      })
    : [];
  const names = new Map(accounts.map((account) => [account.ID, displayName(account)]));
  return places.flatMap((place) => {
    const occupation = place.fietsenstalling_plek_bezetting.find(
      (row) => row.status === "CANCELLED" && row.verloopdatum !== null && row.verloopdatum.getTime() < now,
    );
    if (!occupation) return [];
    const section = sections.find((item) => place.sectie_id !== null && BigInt(item.sectieId) === place.sectie_id);
    const stalling = stallings.find((item) => item.ID === section?.fietsenstallingsId);
    return [{
      placeId: place.id.toString(),
      placeTitle: place.titel,
      stallingId: stalling?.ID ?? "",
      stallingTitle: stalling?.Title ?? "",
      holderName: names.get(occupation.account_id) ?? "",
      expiry: occupation.verloopdatum,
    }];
  });
}

export async function deletePlace(siteId: string, stallingId: string, placeId: string) {
  assertEngine(siteId);
  await requireStalling(siteId, stallingId);
  const sections = await loadSections(stallingId);
  const located = sections.flatMap((section) => section.places.map((place) => ({ section, place }))).find((row) => row.place.id === placeId);
  if (!located) throw new DomainError("place.missing", "Plek niet gevonden");
  if (located.place.occupation) throw new DomainError("place.occupied", "Alleen een vrije plek kan worden verwijderd");
  const bikeTypeId = located.place.bikeTypeIds[0];
  await prisma.fietsenstalling_plek.delete({ where: { id: BigInt(placeId) } });
  if (bikeTypeId !== undefined) {
    const capacity = await prisma.sectie_fietstype.findFirst({
      where: { sectieID: Number(located.section.id), BikeTypeID: bikeTypeId },
    });
    if (capacity && (capacity.Capaciteit ?? 0) > 0) {
      await prisma.sectie_fietstype.update({
        where: { SectionBiketypeID: capacity.SectionBiketypeID },
        data: { Capaciteit: (capacity.Capaciteit ?? 1) - 1 },
      });
    }
  }
}

export async function assertStallingDeletable(stallingId: string): Promise<void> {
  const stalling = await prisma.fietsenstallingen.findUnique({ where: { ID: stallingId } });
  if (!stalling || !TYPES.includes(stalling.Type as StallingType)) return;
  const sections = await loadSections(stalling.ID);
  if (sections.some((section) => sectionHasOccupation(section))) {
    throw new DomainError("stalling.occupied", "Stalling heeft nog gereserveerde, aangeboden of bezette plekken");
  }
  if (stalling.wachtlijst_Id !== null) {
    const waiting = await prisma.wachtlijst_item.count({ where: { wachtlijst_id: stalling.wachtlijst_Id } });
    if (waiting > 0) throw new DomainError("stalling.waiting", "Stalling heeft nog een wachtlijst");
  }
}

export async function assertAccountRemovable(accountId: string): Promise<void> {
  const occupation = await prisma.fietsenstalling_plek_bezetting.findFirst({ where: { account_id: accountId } });
  const waiting = await prisma.wachtlijst_item.findFirst({ where: { account_id: accountId } });
  if (occupation || waiting) {
    throw new DomainError("account.busy", "Dit account heeft nog een plek of een wachtlijstregel");
  }
}

export { displayName, accountName };
