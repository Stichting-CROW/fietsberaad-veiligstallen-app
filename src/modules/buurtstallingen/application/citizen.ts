import { prisma } from "~/server/db";
import { hashPassword, newId, signCitizenSession, verifyPassword } from "../auth";
import { DomainError, type OccupationStatus } from "../domain/types";
import { applyStatusChange, accountName, linkedSubscriptionTypes, removeWaitingListEntry, subscriptionTypeForAccept } from "./service";
import { sendBuurtstallingenMail } from "./mail";

export type Registration = {
  sex: string;
  firstName: string;
  middleName: string;
  lastName: string;
  address: string;
  addressNr: string;
  zip: string;
  city: string;
  phone: string;
  mobile: string;
};

export async function citizenProfile(accountId: string): Promise<Registration | null> {
  const account = await prisma.accounts.findUnique({
    where: { ID: accountId },
    select: { Sex: true, FirstName: true, MiddleName: true, LastName: true, Address: true, Address_Nr: true, Zip: true, City: true, Phone: true, Mobile: true },
  });
  if (!account) return null;
  return {
    sex: account.Sex ?? "",
    firstName: account.FirstName ?? "",
    middleName: account.MiddleName ?? "",
    lastName: account.LastName ?? "",
    address: account.Address ?? "",
    addressNr: account.Address_Nr ?? "",
    zip: account.Zip ?? "",
    city: account.City ?? "",
    phone: account.Phone ?? "",
    mobile: account.Mobile ?? "",
  };
}

/** www/views/buurtstallingen/3_formulier.cfm posts updateAccount before reserveer. */
export async function updateCitizenProfile(accountId: string, input: Partial<Registration>) {
  const value = (key: keyof Registration) => String(input[key] ?? "").trim();
  for (const key of ["firstName", "lastName", "address", "addressNr", "zip", "city"] as const) {
    if (!value(key)) throw new DomainError("validation", "Vul uw naam en adres volledig in");
  }
  await prisma.accounts.update({
    where: { ID: accountId },
    data: {
      Sex: value("sex") || null,
      FirstName: value("firstName"),
      MiddleName: value("middleName"),
      LastName: value("lastName"),
      Address: value("address"),
      Address_Nr: value("addressNr"),
      Zip: value("zip"),
      City: value("city"),
      Phone: value("phone"),
      Mobile: value("mobile"),
    },
  });
}

export async function ensureCitizenCouncilLink(siteId: string, accountId: string) {
  const link = await prisma.gemeenteaccounts.findFirst({
    where: { SiteID: siteId, AccountID: accountId },
  });
  if (!link) {
    await prisma.gemeenteaccounts.create({
      data: { ID: newId(), SiteID: siteId, AccountID: accountId },
    });
  }
}

export async function signInCitizen(input: {
  siteId: string;
  email: string;
  password: string;
  register?: Registration;
}) {
  const email = input.email.trim();
  const existing = await prisma.accounts.findFirst({ where: { Email: email } });
  if (existing) {
    const matches = await verifyPassword(input.password, existing.EncryptedPassword);
    if (!matches) throw new DomainError("auth", "E-mailadres of wachtwoord klopt niet");
    await ensureCitizenCouncilLink(input.siteId, existing.ID);
    return { accountId: existing.ID, token: signCitizenSession(existing.ID) };
  }
  if (!input.register) throw new DomainError("auth", "Er is nog geen account met dit e-mailadres");
  const accountId = newId();
  await prisma.accounts.create({
    data: {
      ID: accountId,
      Email: email,
      EncryptedPassword: await hashPassword(input.password),
      Sex: input.register.sex,
      FirstName: input.register.firstName,
      MiddleName: input.register.middleName,
      LastName: input.register.lastName,
      Address: input.register.address,
      Address_Nr: input.register.addressNr,
      Zip: input.register.zip,
      City: input.register.city,
      Phone: input.register.phone,
      Mobile: input.register.mobile,
      DateRegistration: new Date(),
      Status: "1",
    },
  });
  await prisma.gemeenteaccounts.create({
    data: { ID: newId(), SiteID: input.siteId, AccountID: accountId },
  });
  return { accountId, token: signCitizenSession(accountId) };
}

export async function listMine(siteId: string, accountId: string) {
  const occupations = await prisma.fietsenstalling_plek_bezetting.findMany({
    where: { account_id: accountId },
  });
  const places = occupations.length
    ? await prisma.fietsenstalling_plek.findMany({
        where: { id: { in: occupations.map((row) => row.plek_id) } },
      })
    : [];
  const sectionIds = [...new Set(places.map((place) => (place.sectie_id === null ? null : Number(place.sectie_id))).filter((id): id is number => id !== null))];
  const sections = sectionIds.length
    ? await prisma.fietsenstalling_sectie.findMany({ where: { sectieId: { in: sectionIds } } })
    : [];
  const stallingIds = [...new Set(sections.map((section) => section.fietsenstallingsId).filter((id): id is string => Boolean(id)))];
  const stallings = stallingIds.length
    ? await prisma.fietsenstallingen.findMany({
        where: { ID: { in: stallingIds }, SiteID: siteId },
        select: { ID: true, Title: true, Type: true },
      })
    : [];
  const stallingById = new Map(stallings.map((stalling) => [stalling.ID, stalling]));
  const formsByStalling = new Map(
    await Promise.all(stallings.map(async (stalling) => [stalling.ID, await linkedSubscriptionTypes(stalling.ID)] as const)),
  );
  const mine = occupations.flatMap((occupation) => {
    const place = places.find((item) => item.id === occupation.plek_id);
    const section = sections.find((item) => place?.sectie_id !== null && item.sectieId === Number(place?.sectie_id));
    const stalling = section?.fietsenstallingsId ? stallingById.get(section.fietsenstallingsId) : undefined;
    if (!stalling) return [];
    return [{
      placeId: occupation.plek_id.toString(),
      placeTitle: place?.titel ?? "",
      status: occupation.status,
      expiry: occupation.verloopdatum,
      stallingId: stalling.ID,
      stallingTitle: stalling.Title,
      type: stalling.Type,
      subscriptionTypes: occupation.status === "PROPOSED" ? formsByStalling.get(stalling.ID) ?? [] : [],
    }];
  });
  const lists = await prisma.fietsenstallingen.findMany({
    where: { SiteID: siteId, wachtlijst_Id: { not: null } },
    select: { Title: true, wachtlijst_Id: true },
  });
  const listIds = lists.map((row) => row.wachtlijst_Id).filter((id): id is bigint => id !== null);
  const entries = listIds.length
    ? await prisma.wachtlijst_item.findMany({
        where: { account_id: accountId, wachtlijst_id: { in: listIds } },
      })
    : [];
  return {
    places: mine,
    waitingList: entries.map((entry) => ({
      id: entry.wachtlijst_item_uuid,
      sequence: entry.volg_nummer,
      stallingTitle: lists.find((list) => list.wachtlijst_Id === entry.wachtlijst_id)?.Title ?? "",
    })),
  };
}

export async function citizenPlaceAction(input: {
  siteId: string;
  accountId: string;
  action: "accept" | "decline" | "cancel" | "leave";
  placeId?: string;
  entryId?: string;
  subscriptionTypeId?: number | null;
}) {
  if (input.action === "leave") {
    const item = await prisma.wachtlijst_item.findFirst({
      where: { wachtlijst_item_uuid: input.entryId, account_id: input.accountId },
    });
    if (!item?.wachtlijst_id) throw new DomainError("waitinglist.missing", "Wachtlijstregel niet gevonden");
    const stalling = await prisma.fietsenstallingen.findFirst({
      where: { wachtlijst_Id: item.wachtlijst_id, SiteID: input.siteId },
    });
    if (!stalling) throw new DomainError("stalling.missing", "Stalling niet gevonden");
    await removeWaitingListEntry(input.siteId, stalling.ID, input.entryId ?? "");
    const account = await accountName(input.accountId);
    if (account?.Email && stalling.FMS) {
      const exploitant = stalling.ExploitantID
        ? await prisma.contacts.findUnique({ where: { ID: stalling.ExploitantID }, select: { Email1: true } })
        : null;
      await sendBuurtstallingenMail({
        to: account.Email,
        cc: exploitant?.Email1,
        subject: "U bent van de wachtlijst verwijderd",
        html: `<p>U staat niet langer op de wachtlijst van ${stalling.Title ?? "deze stalling"}.</p>`,
      });
    }
    return { message: "U bent van de wachtlijst gehaald." };
  }
  const next: OccupationStatus = input.action === "accept" ? "RESERVED" : input.action === "decline" ? "FREE" : "CANCELLED";
  const occupation = await prisma.fietsenstalling_plek_bezetting.findFirst({
    where: { plek_id: BigInt(input.placeId ?? "0"), account_id: input.accountId },
  });
  if (!occupation) throw new DomainError("occupation.missing", "Deze plek is niet van u");
  const place = await prisma.fietsenstalling_plek.findUnique({ where: { id: occupation.plek_id } });
  const section = place?.sectie_id
    ? await prisma.fietsenstalling_sectie.findUnique({ where: { sectieId: Number(place.sectie_id) } })
    : null;
  if (!section?.fietsenstallingsId) throw new DomainError("stalling.missing", "Stalling niet gevonden");
  const stalling = await prisma.fietsenstallingen.findFirst({
    where: { ID: section.fietsenstallingsId, SiteID: input.siteId },
  });
  if (!stalling) throw new DomainError("stalling.missing", "Stalling niet gevonden");
  const subscriptionTypeId = input.action === "accept"
    ? await subscriptionTypeForAccept(stalling.ID, input.subscriptionTypeId ?? null)
    : undefined;
  await applyStatusChange({
    siteId: input.siteId,
    stallingId: stalling.ID,
    placeId: occupation.plek_id.toString(),
    next,
    subscriptionTypeId,
  });
  const message = input.action === "accept"
    ? "De plek is voor u gereserveerd."
    : input.action === "decline"
      ? "Het aanbod is afgewezen."
      : "De opzegging is vastgelegd. Lever de sleutel binnen een week in.";
  return { message };
}

// Labels of the Java statuslist and qualificationlist (label_nl_NL.properties).
const CF_STATUS_LABELS: Record<string, string> = {
  FREE: "vrij",
  PROPOSED: "voorstel verstuurd",
  RESERVED: "voorstel geaccepteerd",
  OCCUPIED: "bezet",
  CANCELLED: "opgezegd",
};
const CF_QUALIFICATION_LABELS: Record<string, string> = { NONE: "geen", UNDER: "onderrek", ABOVE: "bovenrek" };

export type CitizenFeedback = { text: string; bold?: boolean }[];

/** Occupations and waiting-list entries of the account in every gemeente (Mijn gegevens > Mijn abonnementen). */
export async function listMineAllSites(accountId: string) {
  const occupations = await prisma.fietsenstalling_plek_bezetting.findMany({ where: { account_id: accountId } });
  const places = occupations.length
    ? await prisma.fietsenstalling_plek.findMany({ where: { id: { in: occupations.map((row) => row.plek_id) } } })
    : [];
  const sectionIds = [...new Set(places.map((place) => (place.sectie_id === null ? null : Number(place.sectie_id))).filter((id): id is number => id !== null))];
  const sections = sectionIds.length
    ? await prisma.fietsenstalling_sectie.findMany({ where: { sectieId: { in: sectionIds } } })
    : [];
  const entries = await prisma.wachtlijst_item.findMany({
    where: { account_id: accountId },
    include: { wachtlijst_fietstype: true },
    orderBy: { creatie_datum: "asc" },
  });
  const listIds = entries.map((entry) => entry.wachtlijst_id).filter((id): id is bigint => id !== null);
  const stallingIds = [...new Set(sections.map((section) => section.fietsenstallingsId).filter((id): id is string => Boolean(id)))];
  const stallings = stallingIds.length || listIds.length
    ? await prisma.fietsenstallingen.findMany({
        where: { OR: [{ ID: { in: stallingIds } }, { wachtlijst_Id: { in: listIds } }] },
        select: { ID: true, Title: true, wachtlijst_Id: true },
      })
    : [];
  const bikeTypeIds = [...new Set(entries.map((entry) => entry.wachtlijst_fietstype?.fiets_type_id).filter((id): id is number => typeof id === "number"))];
  const bikeTypes = bikeTypeIds.length
    ? await prisma.fietstypen.findMany({ where: { ID: { in: bikeTypeIds } }, select: { ID: true, Name: true } })
    : [];
  const mine = occupations.flatMap((occupation) => {
    const place = places.find((item) => item.id === occupation.plek_id);
    const section = sections.find((item) => place?.sectie_id !== null && item.sectieId === Number(place?.sectie_id));
    const stalling = stallings.find((item) => item.ID === section?.fietsenstallingsId);
    if (!place || !section || !stalling) return [];
    const status = occupation.status ?? "FREE";
    return [{
      placeId: occupation.plek_id.toString(),
      stallingTitle: stalling.Title ?? "",
      sectionTitle: section.titel,
      placeTitle: place.titel ?? "",
      status,
      statusLabel: CF_STATUS_LABELS[status] ?? status,
      expiry: status === "OCCUPIED" ? null : occupation.verloopdatum,
    }];
  });
  return {
    places: mine,
    waitingList: entries.flatMap((entry) => {
      const stalling = stallings.find((item) => item.wachtlijst_Id !== null && item.wachtlijst_Id === entry.wachtlijst_id);
      if (!stalling || !entry.wachtlijst_item_uuid) return [];
      const bikeTypeId = entry.wachtlijst_fietstype?.fiets_type_id;
      return [{
        id: entry.wachtlijst_item_uuid,
        stallingTitle: stalling.Title ?? "",
        bikeTypes: bikeTypes.filter((type) => type.ID === bikeTypeId).map((type) => type.Name ?? ""),
        qualification: CF_QUALIFICATION_LABELS[entry.qualificatie ?? "NONE"] ?? entry.qualificatie ?? "",
        sequence: entry.volg_nummer,
        since: entry.creatie_datum,
      }];
    }),
  };
}

async function ownOccupation(accountId: string, placeId: string | undefined) {
  if (!placeId || !/^\d+$/.test(placeId)) return null;
  const occupation = await prisma.fietsenstalling_plek_bezetting.findFirst({
    where: { plek_id: BigInt(placeId), account_id: accountId },
  });
  if (!occupation) return null;
  const place = await prisma.fietsenstalling_plek.findUnique({ where: { id: occupation.plek_id } });
  const section = place?.sectie_id
    ? await prisma.fietsenstalling_sectie.findUnique({ where: { sectieId: Number(place.sectie_id) } })
    : null;
  const stalling = section?.fietsenstallingsId
    ? await prisma.fietsenstallingen.findUnique({ where: { ID: section.fietsenstallingsId }, select: { ID: true, SiteID: true, Title: true } })
    : null;
  return stalling?.SiteID ? { occupation, stalling: { ...stalling, SiteID: stalling.SiteID } } : null;
}

// bikepark.getSubscriptiontypesForBikeType: the linked forms that are offered for the bike type of the occupation.
async function formsForBikeType(stallingId: string, bikeTypeId: number) {
  const forms = await linkedSubscriptionTypes(stallingId);
  const links = forms.length
    ? await prisma.abonnementsvorm_fietstype.findMany({
        where: { SubscriptiontypeID: { in: forms.map((form) => form.id) }, BikeTypeID: bikeTypeId },
        select: { SubscriptiontypeID: true },
      })
    : [];
  const ids = new Set(links.map((link) => link.SubscriptiontypeID));
  return forms.filter((form) => ids.has(form.id));
}

/** Port of the buurtstallingen processMethods of mypage/controller.cfm, with their feedback texts. */
export async function accountBuurtstallingAction(input: {
  accountId: string;
  action: "accept" | "decline" | "cancel" | "leave";
  placeId?: string;
  entryId?: string;
  subscriptionTypeId?: number | null;
}): Promise<{ feedback: CitizenFeedback } | { chooseForm: { id: number; name: string | null; price: string | null }[] }> {
  const email = (await accountName(input.accountId))?.Email ?? "";
  if (input.action === "leave") {
    const item = input.entryId
      ? await prisma.wachtlijst_item.findFirst({ where: { wachtlijst_item_uuid: input.entryId, account_id: input.accountId } })
      : null;
    const stalling = item?.wachtlijst_id
      ? await prisma.fietsenstallingen.findFirst({ where: { wachtlijst_Id: item.wachtlijst_id }, select: { SiteID: true, Title: true } })
      : null;
    if (!stalling?.SiteID) throw new DomainError("waitinglist.missing", "Het wachtlijstitem is niet gevonden");
    try {
      await citizenPlaceAction({ siteId: stalling.SiteID, accountId: input.accountId, action: "leave", entryId: input.entryId });
    } catch {
      throw new DomainError("waitinglist.missing", "Het wachtlijstitem is niet gevonden");
    }
    return { feedback: [{ text: `Wij hebben u van de wachtlijst verwijderd voor een plek in ${stalling.Title ?? ""}.` }] };
  }

  const own = await ownOccupation(input.accountId, input.placeId);
  if (input.action === "cancel") {
    if (!own) throw new DomainError("occupation.missing", "Abonnement niet gevonden");
    const previous = own.occupation.status;
    await citizenPlaceAction({ siteId: own.stalling.SiteID, accountId: input.accountId, action: "cancel", placeId: input.placeId });
    if (previous === "RESERVED") return { feedback: [{ text: "De reservering is verwijderd." }] };
    if (previous !== "OCCUPIED") return { feedback: [] };
    return {
      feedback: [
        { text: "Wij verzoeken u de sleutel binnen een week in te leveren bij de beheerder:" },
        { text: "U-Stal\nFloridadreef 112\nUtrecht", bold: true },
        { text: "Meer informatie over inleveren sleutel en openingstijden: www.u-stal.nl" },
        { text: `U ontvangt ook een e-mail met deze informatie op ${email}` },
      ],
    };
  }

  if (input.action === "decline") {
    if (!own) throw new DomainError("occupation.missing", "Deze plek is niet langer beschikbaar");
    if (own.occupation.status !== "PROPOSED") {
      throw new DomainError("occupation.status", `Deze plek in ${own.stalling.Title ?? ""} is niet langer beschikbaar`);
    }
    await citizenPlaceAction({ siteId: own.stalling.SiteID, accountId: input.accountId, action: "decline", placeId: input.placeId });
    return {
      feedback: [{ text: `U heeft het voorstel voor een plek in ${own.stalling.Title ?? ""} niet geaccepteerd.\nWij hebben u van de wachtlijst verwijderd.` }],
    };
  }

  if (!own || own.occupation.status !== "PROPOSED") throw new DomainError("occupation.missing", "Deze plek is niet langer beschikbaar");
  let subscriptionTypeId = input.subscriptionTypeId ?? null;
  if (subscriptionTypeId === null) {
    const bikeTypeId = own.occupation.fiets_type_id ?? 1;
    const forms = await formsForBikeType(own.stalling.ID, bikeTypeId);
    if (forms.length === 0) throw new DomainError("subscription.missing", `Geen abonnementsvorm gevonden voor fietstype ${bikeTypeId}`);
    if (forms.length > 1) return { chooseForm: forms };
    subscriptionTypeId = forms[0]!.id;
  }
  await citizenPlaceAction({
    siteId: own.stalling.SiteID,
    accountId: input.accountId,
    action: "accept",
    placeId: input.placeId,
    subscriptionTypeId,
  });
  return {
    feedback: [{
      text: `U heeft het voorstel voor een plek in ${own.stalling.Title ?? ""} geaccepteerd.\nBinnen enkele minuten ontvangt u op uw e-mailadres ${email} een e-mail met verdere instructies.`,
    }],
  };
}
