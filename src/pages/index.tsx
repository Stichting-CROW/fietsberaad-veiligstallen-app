import { type NextPage } from "next";

import { getServerSession } from "next-auth/next";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { type Session } from "next-auth";
import HomeComponent from "~/components/HomeComponent";
import SeoHead from "~/components/SeoHead";
import { prisma } from "~/server/db";
import { toMetaDescription } from "~/utils/seo";
import { titleToSlug } from "~/utils/slug";

export async function getServerSideProps(context: any) {
  try {
    const session: Session | null = await getServerSession(
      context.req,
      context.res,
      authOptions,
    );

    const stallingId = context.query.stallingid;
    let parkingMeta: {
      title: string;
      description: string;
      image: string | null;
      url: string;
    } | null = null;

    if (stallingId && typeof stallingId === "string") {
      const parking = await prisma.fietsenstallingen.findFirst({
        where: {
          ID: stallingId,
          Status: "1",
        },
        include: {
          contacts_fietsenstallingen_SiteIDTocontacts: {
            select: { UrlName: true },
          },
        },
      });

      if (parking) {
        const urlName = parking.contacts_fietsenstallingen_SiteIDTocontacts?.UrlName;
        const nameSlug = parking.Title ? titleToSlug(parking.Title) : undefined;
        const qs = new URLSearchParams();
        if (nameSlug) qs.set("name", nameSlug);
        qs.set("stallingid", parking.ID);
        const path = urlName ? `/${urlName}/?${qs.toString()}` : `/?${qs.toString()}`;
        const title = parking.Title
          ? `${parking.Title} - VeiligStallen`
          : "VeiligStallen";
        parkingMeta = {
          title,
          description: toMetaDescription(parking.Description) ||
            `Fietsenstalling ${parking.Title ?? ""} in ${parking.Plaats ?? parking.Location ?? "Nederland"}. Bekijk openingstijden en meer op VeiligStallen.`.trim(),
          image: parking.Image,
          url: path,
        };
      }
    }

    return {
      props: {
        online: true,
        message: "",
        parkingMeta,
      },
    };
  } catch (ex: any) {
    console.error("index.getServerSideProps - error: ", ex.message);
    return {
      props: {
        online: false,
        message: ex.message,
        parkingMeta: null,
      },
    };
  }
}

interface HomeProps {
  online: boolean;
  message: string;
  parkingMeta: {
    title: string;
    description: string;
    image: string | null;
    url: string;
  } | null;
}

const Home: NextPage<HomeProps> = ({ online, message, parkingMeta }) => {
  const title = parkingMeta?.title ?? "VeiligStallen - Nederlandse fietsenstallingen";
  const description = parkingMeta?.description ?? "Nederlandse fietsenstallingen op de kaart. Waar is een goede, veilige of overdekte plek voor je fiets?";
  const url = parkingMeta?.url ?? "/";
  const image = parkingMeta?.image ?? null;

  return (
    <>
      <SeoHead
        title={title}
        description={description}
        url={url}
        image={image}
      />
      <HomeComponent
        online={online}
        message={message}
        url_municipality={undefined}
        url_municipalitypage={undefined}
      />
    </>
  );
};

export default Home;
