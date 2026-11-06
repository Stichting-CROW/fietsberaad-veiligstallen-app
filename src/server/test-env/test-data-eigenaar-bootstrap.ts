import type { Prisma } from "~/generated/prisma-client";
import bcrypt from "bcryptjs";
import { generateID } from "~/utils/server/database-tools";
import { encryptPasswordForApi } from "~/utils/server/password-tools";
import { createSecurityUsersSiteRecord, syncSecurityUsersSitesFromUserContactRole } from "~/utils/server/user-sync-tools";
import { VSUserRoleValuesNew } from "~/types/users";
import { formatPermitTypes } from "~/types/fms-permits";
import { TEST_LOGIN_PASSWORD } from "~/server/test-env/anonymize";

export const TEST_DATA_EIGENAAR_BEHEER_EMAIL = "beheerder@testgemeente.test";
export const TEST_EXPLOITANT_BEHEER_EMAIL = "exploitant@testgemeente.test";

export const TEST_EXPLOITANT = {
  companyName: "Test exploitant API",
  urlName: "test-exploitant-api",
} as const;

export const TEST_DATAPROVIDER = {
  companyName: "Test dataleverancier API",
  urlName: "api-test",
  password: "api-test-$$",
} as const;

export type TestEnvBootstrapIds = {
  exploitantId: string;
  dataproviderId: string;
  dataEigenaarUserId: string;
  exploitantUserId: string;
};

async function hashBeheerPassword(password: string) {
  return {
    bcrypt: await bcrypt.hash(password, 10),
    api: encryptPasswordForApi(password),
  };
}

async function createBeheerUser(
  tx: Prisma.TransactionClient,
  params: {
    userId: string;
    email: string;
    displayName: string;
    siteId: string;
    contactId: string;
    isOwnOrganization: boolean;
    role: string;
  },
  passwordHashes: { bcrypt: string; api: string },
) {
  await tx.security_users.create({
    data: {
      UserID: params.userId,
      UserName: params.email,
      DisplayName: params.displayName,
      EncryptedPassword: passwordHashes.bcrypt,
      EncryptedPassword2: passwordHashes.api,
      Status: "1",
      SiteID: params.siteId,
    },
  });
  await tx.user_contact_role.create({
    data: {
      ID: generateID(),
      UserID: params.userId,
      ContactID: params.contactId,
      NewRoleID: params.role,
      isOwnOrganization: params.isOwnOrganization,
    },
  });
}

/** Dedicated exploitant, dataprovider, beheer users and FMS permit for testgemeente API. */
export async function bootstrapTestDataEigenaarAccounts(
  tx: Prisma.TransactionClient,
  dataEigenaarId: string,
): Promise<TestEnvBootstrapIds> {
  const passwordHashes = await hashBeheerPassword(TEST_LOGIN_PASSWORD);
  const exploitantId = generateID();
  const dataproviderId = generateID();
  const dataEigenaarUserId = generateID();
  const exploitantUserId = generateID();

  await tx.contacts.create({
    data: {
      ID: exploitantId,
      ItemType: "exploitant",
      CompanyName: TEST_EXPLOITANT.companyName,
      UrlName: TEST_EXPLOITANT.urlName,
      Status: "1",
      ParentID: "0",
    },
  });

  await tx.contacts.create({
    data: {
      ID: dataproviderId,
      ItemType: "dataprovider",
      CompanyName: TEST_DATAPROVIDER.companyName,
      UrlName: TEST_DATAPROVIDER.urlName,
      Password: TEST_DATAPROVIDER.password,
      Status: "1",
      ParentID: "0",
      DateRegistration: new Date(),
    },
  });

  await tx.contact_contact.create({
    data: {
      parentSiteID: exploitantId,
      childSiteID: dataEigenaarId,
      admin: true,
    },
  });

  await createBeheerUser(
    tx,
    {
      userId: dataEigenaarUserId,
      email: TEST_DATA_EIGENAAR_BEHEER_EMAIL,
      displayName: "Test beheerder data-eigenaar",
      siteId: dataEigenaarId,
      contactId: dataEigenaarId,
      isOwnOrganization: true,
      role: VSUserRoleValuesNew.RootAdmin,
    },
    passwordHashes,
  );

  await createBeheerUser(
    tx,
    {
      userId: exploitantUserId,
      email: TEST_EXPLOITANT_BEHEER_EMAIL,
      displayName: "Test exploitant beheerder",
      siteId: exploitantId,
      contactId: exploitantId,
      isOwnOrganization: true,
      role: VSUserRoleValuesNew.RootAdmin,
    },
    passwordHashes,
  );

  await tx.user_contact_role.create({
    data: {
      ID: generateID(),
      UserID: exploitantUserId,
      ContactID: dataEigenaarId,
      NewRoleID: VSUserRoleValuesNew.Admin,
      isOwnOrganization: false,
    },
  });

  await tx.fmsservice_permit.create({
    data: {
      OperatorID: dataproviderId,
      SiteID: dataEigenaarId,
      BikeparkID: null,
      Permit: formatPermitTypes(["operator"]),
    },
  });

  return { exploitantId, dataproviderId, dataEigenaarUserId, exploitantUserId };
}

export async function syncBootstrapSecurityUsersSites(
  dataEigenaarId: string,
  ids: TestEnvBootstrapIds,
): Promise<void> {
  await createSecurityUsersSiteRecord(ids.dataEigenaarUserId, dataEigenaarId, false);
  await createSecurityUsersSiteRecord(ids.exploitantUserId, ids.exploitantId, false);
  await syncSecurityUsersSitesFromUserContactRole(ids.dataEigenaarUserId);
  await syncSecurityUsersSitesFromUserContactRole(ids.exploitantUserId);
}

const TEST_USER_EMAILS = [TEST_DATA_EIGENAAR_BEHEER_EMAIL, TEST_EXPLOITANT_BEHEER_EMAIL];

async function deleteStallingsForSite(tx: Prisma.TransactionClient, dataEigenaarId: string): Promise<void> {
  const stallings = await tx.fietsenstallingen.findMany({
    where: { SiteID: dataEigenaarId },
    select: {
      ID: true,
      StallingsID: true,
      fietsenstalling_secties: { select: { sectieId: true } },
    },
  });
  if (stallings.length === 0) return;

  const stallingIds = stallings.map((s) => s.ID);
  const stallingsShortIds = stallings.map((s) => s.StallingsID).filter((id): id is string => !!id);
  const sectieIds = stallings.flatMap((s) => s.fietsenstalling_secties.map((sec) => sec.sectieId));

  await tx.fmsservice_permit.deleteMany({
    where: { BikeparkID: { in: stallingIds } },
  });

  if (sectieIds.length > 0) {
    const plekIds = await tx.fietsenstalling_plek.findMany({
      where: { sectie_id: { in: sectieIds.map((id) => BigInt(id)) } },
      select: { id: true },
    });
    if (plekIds.length > 0) {
      await tx.fietsenstalling_plek_bezetting.deleteMany({
        where: { plek_id: { in: plekIds.map((p) => p.id) } },
      });
    }
    await tx.fietsenstalling_plek.deleteMany({
      where: { sectie_id: { in: sectieIds.map((id) => BigInt(id)) } },
    });
    await tx.fietsenstalling_sectie_kostenperioden.deleteMany({ where: { sectieId: { in: sectieIds } } });
  }

  await tx.sectie_fietstype.deleteMany({
    where: {
      OR: [
        ...(sectieIds.length > 0 ? [{ sectieID: { in: sectieIds } }] : []),
        { StallingsID: { in: stallingIds } },
      ],
    },
  });
  await tx.tariefregels.deleteMany({
    where: {
      OR: [
        { stallingsID: { in: stallingIds } },
        ...(sectieIds.length > 0 ? [{ sectieID: { in: sectieIds } }] : []),
      ],
    },
  });
  await tx.fietsenstallingen_services.deleteMany({ where: { FietsenstallingID: { in: stallingIds } } });
  await tx.abonnementsvorm_fietsenstalling.deleteMany({ where: { BikeparkID: { in: stallingIds } } });
  await tx.uitzonderingenopeningstijden.deleteMany({ where: { fietsenstallingsID: { in: stallingIds } } });
  await tx.fietsenstallingen_winkansen.deleteMany({ where: { FietsenstallingID: { in: stallingIds } } });
  await tx.contact_fietsenstalling.deleteMany({ where: { BikeparkID: { in: stallingIds } } });

  if (sectieIds.length > 0) {
    await tx.fietsenstalling_sectie.deleteMany({ where: { sectieId: { in: sectieIds } } });
  }

  if (stallingsShortIds.length > 0) {
    await tx.wachtrij_transacties.deleteMany({ where: { bikeparkID: { in: stallingsShortIds } } });
    await tx.wachtrij_pasids.deleteMany({ where: { bikeparkID: { in: stallingsShortIds } } });
    await tx.wachtrij_betalingen.deleteMany({ where: { bikeparkID: { in: stallingsShortIds } } });
    await tx.wachtrij_sync.deleteMany({ where: { bikeparkID: { in: stallingsShortIds } } });
    await tx.new_wachtrij_pasids.deleteMany({ where: { bikeparkID: { in: stallingsShortIds } } }).catch(() => undefined);
    await tx.new_wachtrij_betalingen.deleteMany({ where: { bikeparkID: { in: stallingsShortIds } } }).catch(() => undefined);
    await tx.new_wachtrij_sync.deleteMany({ where: { bikeparkID: { in: stallingsShortIds } } }).catch(() => undefined);
    await tx.new_wachtrij_managed_transacties.deleteMany({ where: { bikeparkID: { in: stallingsShortIds } } }).catch(() => undefined);
    await tx.new_bezettingsdata_tmp.deleteMany({ where: { bikeparkID: { in: stallingsShortIds } } }).catch(() => undefined);
    await tx.transacties_archief.deleteMany({ where: { locationid: { in: stallingsShortIds } } });
    await tx.transacties.deleteMany({ where: { FietsenstallingID: { in: stallingsShortIds } } });
    for (const shortId of stallingsShortIds) {
      await tx.accounts_pasids.updateMany({
        where: { huidigeFietsenstallingId: shortId },
        data: { huidigeFietsenstallingId: null, huidigeSectieId: null, dateLastCheck: null },
      });
    }
  }

  await tx.fietsenstallingen.deleteMany({ where: { SiteID: dataEigenaarId } });
}

/** Remove testgemeente API and linked test exploitant, dataprovider and beheer accounts. */
export async function deleteTestDataEigenaarTree(
  tx: Prisma.TransactionClient,
  dataEigenaarId: string,
): Promise<void> {
  const links = await tx.contact_contact.findMany({
    where: { childSiteID: dataEigenaarId },
    select: { parentSiteID: true },
  });
  const exploitantIds = links.map((l) => l.parentSiteID);

  const permitOperators = await tx.fmsservice_permit.findMany({
    where: { SiteID: dataEigenaarId, OperatorID: { not: null } },
    select: { OperatorID: true },
  });
  const operatorIds = [...new Set(permitOperators.map((p) => p.OperatorID).filter((id): id is string => !!id))];
  const dataproviders =
    operatorIds.length > 0
      ? await tx.contacts.findMany({
          where: { ID: { in: operatorIds }, ItemType: "dataprovider" },
          select: { ID: true },
        })
      : [];
  const dataproviderIds = dataproviders.map((d) => d.ID);

  const relatedContactIds = [dataEigenaarId, ...exploitantIds, ...dataproviderIds];

  await tx.fmsservice_permit.deleteMany({
    where: {
      OR: [
        { SiteID: dataEigenaarId },
        { OperatorID: { in: dataproviderIds } },
      ],
    },
  });

  await tx.user_contact_role.deleteMany({
    where: { ContactID: { in: relatedContactIds } },
  });

  const testUsers = await tx.security_users.findMany({
    where: { UserName: { in: TEST_USER_EMAILS } },
    select: { UserID: true },
  });
  const testUserIds = testUsers.map((u) => u.UserID);
  if (testUserIds.length > 0) {
    await tx.security_users_sites.deleteMany({ where: { UserID: { in: testUserIds } } });
    await tx.security_users.deleteMany({ where: { UserID: { in: testUserIds } } });
  }

  await tx.contact_contact.deleteMany({
    where: {
      OR: [
        { childSiteID: dataEigenaarId },
        { parentSiteID: { in: exploitantIds } },
      ],
    },
  });

  await tx.modules_contacts.deleteMany({ where: { SiteID: dataEigenaarId } });
  await tx.documenttemplates.deleteMany({ where: { siteID: dataEigenaarId } });
  await tx.contact_report_settings.deleteMany({ where: { siteID: dataEigenaarId } });

  await deleteStallingsForSite(tx, dataEigenaarId);

  await tx.contacts.deleteMany({ where: { ID: { in: relatedContactIds } } });
}
