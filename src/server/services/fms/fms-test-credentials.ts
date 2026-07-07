import { prisma } from "~/server/db";
import { env } from "~/env.mjs";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";

/** First dataprovider with FMS permit on testgemeente (via normal FMS rechten UX). */
export async function findTestgemeenteLinkedDataprovider() {
  const testgemeente = await prisma.contacts.findFirst({
    where: {
      CompanyName: TESTGEMEENTE_NAME,
      ItemType: "organizations",
    },
    select: { ID: true },
  });
  if (!testgemeente) return null;

  const permits = await prisma.fmsservice_permit.findMany({
    where: {
      SiteID: testgemeente.ID,
      OperatorID: { not: null },
    },
    include: {
      contacts_fmsservice_permit_OperatorIDTocontacts: {
        select: { ItemType: true, UrlName: true, Password: true, CompanyName: true },
      },
    },
    take: 20,
  });

  for (const permit of permits) {
    const operator = permit.contacts_fmsservice_permit_OperatorIDTocontacts;
    if (
      operator?.ItemType === "dataprovider" &&
      operator.UrlName?.trim() &&
      operator.Password?.trim()
    ) {
      return {
        urlName: operator.UrlName,
        password: operator.Password,
        companyName: operator.CompanyName,
      };
    }
  }

  return null;
}

/**
 * Credentials for FMS compare/write tests: env overrides, else dataprovider linked via FMS rechten.
 */
export async function resolveTestFmsCredentials(): Promise<{
  username: string;
  password: string | null;
  source: "env" | "database" | "none";
}> {
  const envUser = env.FMS_TEST_USER?.trim();
  const envPass = env.FMS_TEST_PASS?.trim();

  if (envUser && envPass) {
    return { username: envUser, password: envPass, source: "env" };
  }

  const linked = await findTestgemeenteLinkedDataprovider();
  if (linked) {
    return {
      username: linked.urlName,
      password: linked.password,
      source: "database",
    };
  }

  return {
    username: envUser ?? "",
    password: envPass ?? null,
    source: "none",
  };
}

/** HTTP Basic Authorization header for FMS test calls. */
export async function buildTestFmsAuthHeader(): Promise<string | null> {
  const creds = await resolveTestFmsCredentials();
  if (!creds.password || !creds.username) return null;
  return `Basic ${Buffer.from(`${creds.username}:${creds.password}`).toString("base64")}`;
}
