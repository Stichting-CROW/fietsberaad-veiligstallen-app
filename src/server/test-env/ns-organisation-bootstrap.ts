import type { Prisma } from "~/generated/prisma-client";
import { generateID } from "~/utils/server/database-tools";
import {
  NS_DATA_EIGENAAR,
  NS_DATA_EIGENAAR_URL_NAME,
  NS_EXPLOITANT,
  NS_EXPLOITANT_URL_NAME,
} from "~/data/ns-organisation-data";

export type NsOrganisationBootstrapIds = {
  dataEigenaarId: string;
  exploitantId: string;
};

export async function findNsDataEigenaar(tx: Prisma.TransactionClient) {
  return tx.contacts.findFirst({
    where: { UrlName: NS_DATA_EIGENAAR_URL_NAME },
    select: { ID: true, CompanyName: true },
  });
}

/** Create NS data-eigenaar (`ns`) and exploitant (`ns-stations`) for NS Places sync. */
export async function bootstrapNsOrganisation(
  tx: Prisma.TransactionClient,
): Promise<NsOrganisationBootstrapIds> {
  const existing = await findNsDataEigenaar(tx);
  if (existing) {
    throw new Error("NS data-eigenaar (UrlName 'ns') bestaat al");
  }

  const existingExploitant = await tx.contacts.findFirst({
    where: { UrlName: NS_EXPLOITANT_URL_NAME },
    select: { ID: true },
  });
  if (existingExploitant) {
    throw new Error("NS exploitant (UrlName 'ns-stations') bestaat al");
  }

  const dataEigenaarId = generateID();
  const exploitantId = generateID();

  await tx.contacts.create({
    data: {
      ID: dataEigenaarId,
      ...NS_DATA_EIGENAAR,
    },
  });

  await tx.contacts.create({
    data: {
      ID: exploitantId,
      ...NS_EXPLOITANT,
    },
  });

  await tx.contact_contact.create({
    data: {
      parentSiteID: exploitantId,
      childSiteID: dataEigenaarId,
      admin: true,
    },
  });

  return { dataEigenaarId, exploitantId };
}
