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
    const link = await prisma.gemeenteaccounts.findFirst({
      where: { SiteID: input.siteId, AccountID: existing.ID },
    });
    if (!link) {
      await prisma.gemeenteaccounts.create({
        data: { ID: newId(), SiteID: input.siteId, AccountID: existing.ID },
      });
    }
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
