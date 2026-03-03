import { type NextPage } from "next";

import { getServerSession } from "next-auth/next";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { type Session } from "next-auth";

import HomeComponent, { type HomeComponentProps } from "~/components/HomeComponent";
import SeoHead from "~/components/SeoHead";
import { prisma } from "~/server/db";
import { toMetaDescription } from "~/utils/seo";

export const getServerSideProps = async (context: any) => {
  try {
    const { municipality } = context.params as { municipality: string | string[] };
    const municipalitySlug = Array.isArray(municipality) ? municipality[0] : municipality;
    const stallingId = context.query.stallingid;
    const stallingIdStr = stallingId && typeof stallingId === "string" ? stallingId : null;

    const session: Session | null = await getServerSession(
      context.req,
      context.res,
      authOptions,
    );

    let seoMeta: {
      title: string;
      description: string;
      url: string;
      image: string | null;
    };

    // Fetch municipality for base meta
    const contact = municipalitySlug
      ? await prisma.contacts.findFirst({
          where: { UrlName: municipalitySlug, Status: { not: "0" } },
          select: { CompanyName: true, UrlName: true },
        })
      : null;

    const baseTitle = contact?.CompanyName
      ? `${contact.CompanyName} - VeiligStallen`
      : "VeiligStallen";
    const baseDescription = "Nederlandse fietsenstallingen op de kaart. Waar is een goede, veilige of overdekte plek voor je fiets?";
    const baseUrl = municipalitySlug ? `/${municipalitySlug}` : "/";

    if (stallingIdStr) {
      // Parking detail: fetch parking and override meta
      const parking = await prisma.fietsenstallingen.findFirst({
        where: { ID: stallingIdStr, Status: "1" },
        include: {
          contacts_fietsenstallingen_SiteIDTocontacts: {
            select: { UrlName: true },
          },
        },
      });

      if (parking) {
        const urlName = parking.contacts_fietsenstallingen_SiteIDTocontacts?.UrlName ?? municipalitySlug;
        const path = urlName ? `/${urlName}/?stallingid=${parking.ID}` : `/?stallingid=${parking.ID}`;
        const title = [parking.Title, parking.Plaats ?? parking.Location]
          .filter(Boolean)
          .join(" – ");
        seoMeta = {
          title: title ? `${title} | VeiligStallen` : baseTitle,
          description: toMetaDescription(parking.Description) ||
            `Fietsenstalling ${parking.Title ?? ""} in ${parking.Plaats ?? parking.Location ?? "Nederland"}. Bekijk openingstijden en meer op VeiligStallen.`.trim(),
          url: path,
          image: parking.Image,
        };
      } else {
        seoMeta = {
          title: baseTitle,
          description: baseDescription,
          url: baseUrl,
          image: null,
        };
      }
    } else {
      seoMeta = {
        title: baseTitle,
        description: baseDescription,
        url: baseUrl,
        image: null,
      };
    }

    return {
      props: {
        online: true,
        message: "",
        url_municipality: municipalitySlug,
        url_municipalitypage: undefined,
        seoMeta,
      },
    };
  } catch (ex: any) {
    console.error("[municipality]/index.getServerSideProps - error: ", ex.message);
    return {
      props: {
        online: false,
        message: ex.message,
        url_municipality: undefined,
        url_municipalitypage: undefined,
        seoMeta: {
          title: "VeiligStallen",
          description: "Nederlandse fietsenstallingen op de kaart",
          url: "/",
          image: null,
        },
      },
    };
  }
};

interface MunicipalityIndexProps extends HomeComponentProps {
  seoMeta: {
    title: string;
    description: string;
    url: string;
    image: string | null;
  };
}

const MunicipalitySlug: NextPage<MunicipalityIndexProps> = (props) => {
  const { seoMeta, ...homeProps } = props;
  return (
    <>
      <SeoHead
        title={seoMeta.title}
        description={seoMeta.description}
        url={seoMeta.url}
        image={seoMeta.image}
      />
      <HomeComponent {...homeProps} />
    </>
  );
};

export default MunicipalitySlug;