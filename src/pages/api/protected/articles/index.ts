import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import type { Prisma } from "@prisma/client";
import { type VSArticle, type VSArticleInLijst, articleSelect, articleLijstSelect } from "~/types/articles";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { validateUserSession } from "~/utils/server/database-tools";

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
        SiteID: { in: sitesToGetArticlesFor() }
      };
      if (req.query.Title) {
        where.Title = req.query.Title as string
      }
      if (req.query.Navigation) {
        where.Navigation = req.query.Navigation as string;
      }

      // Define full query
      const query: Prisma.articlesFindFirstArgs = {
        where: where,
        select: compact ? articleLijstSelect : articleSelect,
        orderBy: {
          SortOrder: 'asc',
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