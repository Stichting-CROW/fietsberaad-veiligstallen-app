import { PrismaClient } from "../../src/generated/prisma-client";
import { hashPassword } from "../../src/modules/buurtstallingen/auth";
import { loadLocalEnv } from "./env";
import {
  ACCOUNT_OCCUPANT,
  ACCOUNT_SECOND,
  OCCUPANT_PASS,
  PASS_OCCUPANT,
  PORTAL_EMAIL,
  DOC_CONTRACT,
  DOC_MACHTIGING,
  DOC_STANDARD,
  EXPLOITANT,
  EXPLOITANT_EMAIL,
  PASSWORD,
  SHORT_A,
  SHORT_B,
  SHORT_BEWAAKT,
  SHORT_TROMMEL,
  SITE_A,
  SITE_B,
  STALL_A,
  STALL_B,
  STALL_BEWAAKT,
  STALL_TROMMEL,
  URL_A,
  URL_B,
  WAITER_EMAIL,
  people,
  users,
} from "./fixture";

loadLocalEnv();

const siteIds = [SITE_A, SITE_B];
const contactIds = [SITE_A, SITE_B, EXPLOITANT];
const stallingIds = [STALL_A, STALL_TROMMEL, STALL_B, STALL_BEWAAKT];
const shortIds = [SHORT_A, SHORT_TROMMEL, SHORT_B, SHORT_BEWAAKT];
const operatorIds = Object.values(users).map((user) => user.id);
const accountIds = people.map((person) => person.id);
const emails = [...people.map((person) => person.email), ...Object.values(users).map((user) => user.email), PORTAL_EMAIL];
const documentIds = [DOC_CONTRACT, DOC_MACHTIGING, DOC_STANDARD];

let passwordHash: string | undefined;

function client(): PrismaClient {
  return new PrismaClient();
}

export async function resetFixture(prisma = client()): Promise<void> {
  try {
    const stallings = await prisma.fietsenstallingen.findMany({
      where: { OR: [{ ID: { in: stallingIds } }, { StallingsID: { in: shortIds } }, { SiteID: { in: siteIds } }] },
      select: { ID: true, wachtlijst_Id: true },
    });
    const ownedStallingIds = stallings.map((row) => row.ID);
    const forms = await prisma.abonnementsvormen.findMany({
      where: { siteID: { in: siteIds } },
      select: { ID: true },
    });
    const formIds = forms.map((form) => form.ID);
    if (formIds.length) {
      await prisma.abonnementsvorm_fietstype.deleteMany({ where: { SubscriptiontypeID: { in: formIds } } });
      await prisma.abonnementsvorm_fietsenstalling.deleteMany({ where: { SubscriptiontypeID: { in: formIds } } });
    }
    if (ownedStallingIds.length) {
      await prisma.abonnementsvorm_fietsenstalling.deleteMany({ where: { BikeparkID: { in: ownedStallingIds } } });
    }
    await prisma.abonnementen.deleteMany({
      where: { OR: [{ siteID: { in: siteIds } }, { AccountID: { in: accountIds } }, { bikeparkID: { in: shortIds } }] },
    });
    if (formIds.length) await prisma.abonnementsvormen.deleteMany({ where: { ID: { in: formIds } } });
    await prisma.documenttemplates.deleteMany({
      where: { OR: [{ ID: { in: documentIds } }, { siteID: { in: siteIds } }] },
    });
    await prisma.rapportageinfo.deleteMany({ where: { gemeenteID: { in: siteIds } } });
    const sections = ownedStallingIds.length
      ? await prisma.fietsenstalling_sectie.findMany({
          where: { fietsenstallingsId: { in: ownedStallingIds } },
          select: { sectieId: true },
        })
      : [];
    const sectionIds = sections.map((row) => row.sectieId);
    if (sectionIds.length) {
      const places = await prisma.fietsenstalling_plek.findMany({
        where: { sectie_id: { in: sectionIds.map((id) => BigInt(id)) } },
        select: { id: true },
      });
      if (places.length) {
        await prisma.fietsenstalling_plek.deleteMany({ where: { id: { in: places.map((place) => place.id) } } });
      }
      await prisma.sectie_fietstype.deleteMany({
        where: { OR: [{ sectieID: { in: sectionIds } }, { StallingsID: { in: ownedStallingIds } }] },
      });
      await prisma.fietsenstalling_sectie.deleteMany({ where: { sectieId: { in: sectionIds } } });
    }
    const listIds = stallings.flatMap((row) => (row.wachtlijst_Id == null ? [] : [row.wachtlijst_Id]));
    const items = await prisma.wachtlijst_item.findMany({
      where: {
        OR: [
          ...(listIds.length ? [{ wachtlijst_id: { in: listIds } }] : []),
          { account_id: { in: accountIds } },
        ],
      },
      select: { wachtlijst_item_id: true },
    });
    if (items.length) {
      await prisma.wachtlijst_fietstype.deleteMany({
        where: { wachtlijst_id: { in: items.map((item) => item.wachtlijst_item_id) } },
      });
      await prisma.wachtlijst_item.deleteMany({
        where: { wachtlijst_item_id: { in: items.map((item) => item.wachtlijst_item_id) } },
      });
    }
    if (ownedStallingIds.length) {
      await prisma.fietsenstallingen.updateMany({ where: { ID: { in: ownedStallingIds } }, data: { wachtlijst_Id: null } });
    }
    if (listIds.length) await prisma.wachtlijst.deleteMany({ where: { id: { in: listIds } } });
    if (ownedStallingIds.length) await prisma.fietsenstallingen.deleteMany({ where: { ID: { in: ownedStallingIds } } });
    const extraAccounts = await prisma.accounts.findMany({
      where: { Email: { in: [PORTAL_EMAIL] } },
      select: { ID: true },
    });
    const cleanupIds = [...new Set([...accountIds, ...extraAccounts.map((row) => row.ID)])];
    await prisma.financialtransactions.deleteMany({ where: { accountID: { in: cleanupIds } } });
    const councilAccounts = await prisma.gemeenteaccounts.findMany({
      where: { AccountID: { in: cleanupIds } },
      select: { ID: true },
    });
    const ownedPasses = await prisma.accounts_pasids.findMany({
      where: { AccountID: { in: [...cleanupIds, ...councilAccounts.map((row) => row.ID)] } },
      select: { ID: true },
    });
    if (ownedPasses.length) {
      await prisma.abonnementen.deleteMany({ where: { bikepassID: { in: ownedPasses.map((pass) => pass.ID) } } });
      await prisma.accounts_pasids.deleteMany({ where: { ID: { in: ownedPasses.map((pass) => pass.ID) } } });
    }
    await prisma.producten.deleteMany({ where: { titel: "E2E tegoed" } });
    await prisma.gemeenteaccounts.deleteMany({
      where: { OR: [{ SiteID: { in: siteIds } }, { AccountID: { in: cleanupIds } }] },
    });
    await prisma.accounts.deleteMany({ where: { OR: [{ ID: { in: cleanupIds } }, { Email: { in: emails } }] } });
    await prisma.user_contact_role.deleteMany({
      where: { OR: [{ UserID: { in: operatorIds } }, { ContactID: { in: siteIds } }] },
    });
    await prisma.security_users_sites.deleteMany({
      where: { OR: [{ UserID: { in: operatorIds } }, { SiteID: { in: siteIds } }] },
    });
    await prisma.security_users.deleteMany({
      where: { OR: [{ UserID: { in: operatorIds } }, { UserName: { in: Object.values(users).map((user) => user.email) } }] },
    });
    await prisma.modules_contacts.deleteMany({ where: { SiteID: { in: siteIds } } });
    await prisma.contacts.deleteMany({
      where: { OR: [{ ID: { in: contactIds } }, { UrlName: { in: [URL_A, URL_B] } }] },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function addSection(
  tx: PrismaClient,
  input: { stallingId: string; title: string; qualification: "UNDER" | "ABOVE" | "NONE"; occupants: Array<string | null> },
): Promise<void> {
  const section = await tx.fietsenstalling_sectie.create({
    data: {
      titel: input.title,
      fietsenstallingsId: input.stallingId,
      qualificatie: input.qualification,
      capaciteit: input.occupants.length,
      isKluis: false,
      Reservable: false,
      Bezetting: input.occupants.filter(Boolean).length,
      isactief: true,
    },
  });
  await tx.sectie_fietstype.create({
    data: {
      Capaciteit: input.occupants.length,
      Toegestaan: true,
      sectieID: section.sectieId,
      StallingsID: input.stallingId,
      BikeTypeID: 1,
    },
  });
  for (let index = 0; index < input.occupants.length; index += 1) {
    const place = await tx.fietsenstalling_plek.create({
      data: {
        plek_uuid: crypto.randomUUID(),
        sectie_id: BigInt(section.sectieId),
        titel: `Plek: ${index + 1}`,
        isActief: true,
      },
    });
    await tx.plaats_fietstype.create({ data: { plaats_id: place.id, fiets_type_id: 0 } });
    const accountId = input.occupants[index];
    if (accountId) {
      await tx.fietsenstalling_plek_bezetting.create({
        data: {
          account_id: accountId,
          plek_id: place.id,
          bezetting_uuid: crypto.randomUUID(),
          status: "OCCUPIED",
          verloopdatum: new Date("2099-01-01T00:00:00Z"),
          fiets_type_id: 0,
        },
      });
    }
  }
}

export async function seed(): Promise<void> {
  await resetFixture();
  const prisma = client();
  try {
    passwordHash ??= await hashPassword(PASSWORD);
    const mailing = new Date();
    mailing.setMonth(mailing.getMonth() + 6);
    await prisma.$transaction(async (tx) => {
      await tx.contacts.create({
        data: { ID: SITE_A, ItemType: "organizations", CompanyName: "E2E Buurt A", UrlName: URL_A, Status: "1", Email1: "e2e-buurt-org-a@example.test" },
      });
      await tx.contacts.create({
        data: { ID: SITE_B, ItemType: "organizations", CompanyName: "E2E Buurt B", UrlName: URL_B, Status: "1", Email1: "e2e-buurt-org-b@example.test" },
      });
      await tx.contacts.create({
        data: { ID: EXPLOITANT, ItemType: "exploitant", CompanyName: "E2E Exploitant", Status: "1", Email1: EXPLOITANT_EMAIL },
      });
      await tx.modules_contacts.create({ data: { ModuleID: "buurtstallingen", SiteID: SITE_A } });
      await tx.modules_contacts.create({ data: { ModuleID: "abonnementen", SiteID: SITE_A } });
      for (const user of Object.values(users)) {
        await tx.security_users.create({
          data: {
            UserID: user.id,
            UserName: user.email,
            EncryptedPassword: passwordHash,
            DisplayName: user.name,
            SiteID: user.siteId,
            Status: "1",
          },
        });
        await tx.user_contact_role.create({
          data: {
            ID: user.roleId,
            UserID: user.id,
            ContactID: user.siteId,
            NewRoleID: user.role,
            isOwnOrganization: true,
          },
        });
        await tx.security_users_sites.create({
          data: { UserID: user.id, SiteID: user.siteId, IsContact: user.role === "rootadmin" },
        });
      }
      for (const person of people) {
        await tx.accounts.create({
          data: {
            ID: person.id,
            Email: person.email,
            EncryptedPassword: passwordHash,
            FirstName: person.first,
            LastName: person.last,
            Address: "Teststraat",
            Address_Nr: "1",
            Zip: "1234 AB",
            City: "Teststad",
            Status: "1",
          },
        });
        await tx.gemeenteaccounts.create({ data: { ID: person.link, SiteID: SITE_A, AccountID: person.id } });
      }
      await tx.documenttemplates.create({
        data: { ID: DOC_CONTRACT, name: "E2E contract", html: "<p>Contract {account.naam}</p>", siteID: SITE_A, dateCreated: new Date() },
      });
      await tx.documenttemplates.create({
        data: { ID: DOC_MACHTIGING, name: "E2E machtiging", html: "<p>Machtiging {account.naam}</p>", siteID: SITE_A, dateCreated: new Date() },
      });
      await tx.documenttemplates.create({
        data: { ID: DOC_STANDARD, name: "E2E standaard", html: "<p>Standaard</p>", siteID: "1", dateCreated: new Date() },
      });
      const stalling = {
        FMS: true,
        Status: "1",
        ExploitantID: EXPLOITANT,
      };
      await tx.fietsenstallingen.create({
        data: { ID: STALL_A, StallingsID: SHORT_A, SiteID: SITE_A, Title: "E2E Buurtstalling", Type: "buurtstalling", ...stalling },
      });
      await tx.fietsenstallingen.create({
        data: { ID: STALL_TROMMEL, StallingsID: SHORT_TROMMEL, SiteID: SITE_A, Title: "E2E Fietstrommel", Type: "fietstrommel", ...stalling },
      });
      await tx.fietsenstallingen.create({
        data: { ID: STALL_B, StallingsID: SHORT_B, SiteID: SITE_B, Title: "E2E Stalling B", Type: "buurtstalling", FMS: true, Status: "1" },
      });
      const product = await tx.abonnementsvormen.create({
        data: {
          naam: "E2E abonnement",
          prijs: "10.00",
          tijdsduur: 12,
          siteID: SITE_A,
          bikeparkTypeID: "buurtstalling",
          isActief: true,
          idmiddelen: "sleutelhanger",
          contractID: DOC_CONTRACT,
          paymentAuthorizationID: DOC_MACHTIGING,
        },
      });
      await tx.abonnementsvorm_fietsenstalling.createMany({
        data: [STALL_A, STALL_TROMMEL].map((id) => ({ SubscriptiontypeID: product.ID, BikeparkID: id })),
      });
      const bewaakt = await tx.abonnementsvormen.create({
        data: {
          naam: "E2E bewaakt",
          prijs: "15.00",
          tijdsduur: 1,
          siteID: SITE_A,
          bikeparkTypeID: "bewaakt",
          isActief: true,
          idmiddelen: "sleutelhanger",
          exploitantSiteID: EXPLOITANT,
        },
      });
      await tx.fietsenstallingen.create({
        data: { ID: STALL_BEWAAKT, StallingsID: SHORT_BEWAAKT, SiteID: SITE_A, Title: "E2E Bewaakte stalling", Type: "bewaakt", ...stalling },
      });
      await tx.abonnementsvorm_fietsenstalling.create({
        data: { SubscriptiontypeID: bewaakt.ID, BikeparkID: STALL_BEWAAKT },
      });
      await tx.producten.create({
        data: { titel: "E2E tegoed", omschrijving: "E2E opwaardering", prijs: "10.00", credit: "10.00", status: "1" },
      });
      await tx.accounts_pasids.create({
        data: { ID: PASS_OCCUPANT, AccountID: ACCOUNT_OCCUPANT, SiteID: SITE_A, PasID: OCCUPANT_PASS, Pastype: "sleutelhanger" },
      });
      await addSection(tx as PrismaClient, { stallingId: STALL_A, title: "Onder", qualification: "UNDER", occupants: [null] });
      await addSection(tx as PrismaClient, { stallingId: STALL_A, title: "Boven", qualification: "ABOVE", occupants: [ACCOUNT_OCCUPANT, ACCOUNT_SECOND] });
      await addSection(tx as PrismaClient, { stallingId: STALL_TROMMEL, title: "Trommel", qualification: "NONE", occupants: [ACCOUNT_OCCUPANT] });
      await addSection(tx as PrismaClient, { stallingId: STALL_B, title: "B", qualification: "NONE", occupants: [null] });
      const list = await tx.wachtlijst.create({ data: {} });
      await tx.fietsenstallingen.update({ where: { ID: STALL_TROMMEL }, data: { wachtlijst_Id: list.id } });
      const entry = await tx.wachtlijst_item.create({
        data: {
          wachtlijst_id: list.id,
          account_id: people.find((person) => person.email === WAITER_EMAIL)?.id,
          volg_nummer: 1,
          qualificatie: "NONE",
          wachtlijst_item_uuid: crypto.randomUUID(),
          creatie_datum: new Date(),
          datum_mailing: mailing,
        },
      });
      await tx.wachtlijst_fietstype.create({ data: { wachtlijst_id: entry.wachtlijst_item_id, fiets_type_id: 0 } });
    }, { timeout: 60_000 });
  } finally {
    await prisma.$disconnect();
  }
}
