import type { GetServerSidePropsContext, GetServerSidePropsResult } from "next";
import { prisma } from "~/server/db";
import { buildPublicStallingPathForParking } from "~/utils/server/public-stalling-url";

const parkingSelect = {
  ID: true,
  Title: true,
  Coordinaten: true,
  EditorCreated: true,
  IsStationsstalling: true,
  contacts_fietsenstallingen_SiteIDTocontacts: { select: { UrlName: true } },
} as const;

/** Legacy `/[gemeente]/fietskluizen|stallingen/[StallingsID]` → `/{geo}?stallingid=&name=`. */
export async function legacyStallingRedirectFromStallingsId(
  context: GetServerSidePropsContext,
): Promise<GetServerSidePropsResult<Record<string, never>>> {
  const rawId = context.params?.stallingsId ?? context.params?.id;
  const segment = Array.isArray(rawId) ? rawId[0] : rawId;
  const stallingsId = segment?.split("#")[0]?.trim();

  if (!stallingsId) {
    return { redirect: { destination: "/", permanent: false } };
  }

  const parking = await prisma.fietsenstallingen.findFirst({
    where: {
      StallingsID: stallingsId,
      Status: "1",
      Title: { not: "Systeemstalling" },
    },
    select: parkingSelect,
  });

  if (!parking) {
    return { redirect: { destination: "/", permanent: true } };
  }

  const destination = await buildPublicStallingPathForParking(parking);
  return { redirect: { destination, permanent: false } };
}
