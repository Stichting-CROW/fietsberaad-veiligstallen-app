import { type NextPage } from "next";

import { getServerSession } from "next-auth/next";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { type Session } from "next-auth";

import Content from "~/components/Content";
import { prisma } from "~/server/db";
import { toMetaDescription } from "~/utils/seo";

export const getServerSideProps = async (context: any) => {
  try {
    const { municipality, page } = context.params as {
      municipality: string | string[];
      page: string | string[];
    };
    const municipalitySlug = Array.isArray(municipality) ? municipality[0] : municipality;
    const pageSlug = Array.isArray(page) ? page[0] : page;

    const session: Session | null = await getServerSession(
      context.req,
      context.res,
      authOptions,
    );

    let seoMeta: {
      title: string;
      description: string;
      url: string;
    } | null = null;

    if (municipalitySlug && pageSlug) {
      const contact = await prisma.contacts.findFirst({
        where: { UrlName: municipalitySlug, Status: { not: "0" } },
        select: { ID: true, CompanyName: true, UrlName: true },
      });

      if (contact) {
        const article = await prisma.articles.findFirst({
          where: {
            SiteID: contact.ID,
            Title: pageSlug,
            Status: "1",
            ModuleID: { in: ["veiligstallen", "veiligstallenprisma"] },
            OR: [
              { Archived: null },
              { Archived: "0" },
              { Archived: { not: "1" } },
            ],
          },
          select: { Title: true, DisplayTitle: true, Abstract: true },
        });

        if (article) {
          const pageTitle = article.DisplayTitle ?? article.Title ?? pageSlug;
          seoMeta = {
            title: `${pageTitle} | ${contact.CompanyName ?? "Gemeente"} - VeiligStallen`,
            description: toMetaDescription(article.Abstract) ||
              `${pageTitle} - Fietsenstallingen en informatie op VeiligStallen.nl`.trim(),
            url: `/${municipalitySlug}/${pageSlug}`,
          };
        }
      }
    }

    return {
      props: {
        online: true,
        message: "",
        url_municipality: municipalitySlug,
        url_municipalitypage: pageSlug,
        seoMeta,
      },
    };
  } catch (ex: any) {
    console.error("[municipality]/[page]/index.getServerSideProps - error: ", ex.message);
    return {
      props: {
        online: false,
        message: ex.message,
        url_municipality: undefined,
        url_municipalitypage: undefined,
        seoMeta: null,
      },
    };
  }
};

interface ContentPageProps {
  online: boolean;
  message: string;
  url_municipality: string | undefined;
  url_municipalitypage: string | undefined;
  seoMeta: {
    title: string;
    description: string;
    url: string;
  } | null;
}

const ContentPage: NextPage<ContentPageProps> = (props) => {
  return <Content {...props} />;
};

export default ContentPage;