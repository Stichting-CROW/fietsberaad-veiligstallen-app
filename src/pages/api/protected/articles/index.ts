import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import type { Prisma } from "~/generated/prisma-client";
import { type VSArticle, type VSArticleInLijst, articleSelect, articleLijstSelect } from "~/types/articles";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { validateUserSession } from "~/utils/server/database-tools";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

// TODO: handle adding the article to the user's sites and setting correct rights
// TODO: check if user has sufficient rights to create an article

export type ArticlesResponse = {
  data?: VSArticle[] | VSArticleInLijst[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);

  // For GET requests, allow public access
  if (req.method === "GET") {
    // Continue with the existing GET logic without authentication checks
  } else {
    // For POST/PUT/DELETE, require authentication and specific rights
    if (!session?.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const hasInstellingenSiteContentPages = userHasRight(session?.user?.securityProfile, VSSecurityTopic.instellingen_site_content_pages);
    if (!hasInstellingenSiteContentPages) {
      res.status(403).json({ error: "Access denied - insufficient permissions" });
      return;
    }
  }

  const validateUserSessionResult = await validateUserSession(session, "articles");

  // if ('error' in validateUserSessionResult) {
  //   res.status(validateUserSessionResult.status).json({articles: []});
  //   return;
  // }

  let querysites: string[] = [];
  if("sites" in validateUserSessionResult) {
    querysites  = validateUserSessionResult.sites;
  }

  const activeContactId = session?.user?.activeContactId;

  switch (req.method) {
    case "GET": {
      // Check if compact mode is requested
      const compact = req.query.compact === 'true';
      
      // Define the sites we want to get articles for
      const sitesToGetArticlesFor = () => {
        // If SiteID is provided as query parameter, we want to get articles for that site
        if (req.query.SiteID) {
          return [req.query.SiteID as string];
        }
        // If there's an active contact ID and no SiteID is provided
        // -> Get articles for that contact
        else if (activeContactId) {
          return [activeContactId];
        }
        // Otherwise, we want to get articles for all sites
        return querysites;
      }

      // Define where clause
      const where: Prisma.articlesWhereInput = {
        SiteID: { in: sitesToGetArticlesFor() },
        // Exclude archived articles from lists (Archived != '1')
        // Include null (legacy records), '0' (not archived), and anything not '1'
        OR: [
          { Archived: null },
          { Archived: '0' },
          { Archived: { not: '1' } }
        ]
      };
      if (req.query.Title) {
        where.Title = req.query.Title as string
      }
      if (req.query.Navigation) {
        where.Navigation = req.query.Navigation as string;
      }

      // Define full query
      const query = {
        where: where,
        select: compact ? articleLijstSelect : articleSelect,
        orderBy: {
          SortOrder: 'asc' as const,
        }
      }

      let articles;
      if (req.query.findFirst) {
        articles = (await prisma.articles.findFirst(query)) as unknown as (VSArticle | VSArticleInLijst);
      }
      else {
        articles = (await prisma.articles.findMany(query)) as unknown as (VSArticle[] | VSArticleInLijst[]);
      }
    
      res.status(200).json({data: articles});
      break;
    }
    default: {
      res.status(405).json({error: "Method Not Allowed"}); // Method Not Allowed
    }
  }
}