import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { z } from "zod";
import { generateID, validateUserSession, updateSecurityProfile } from "~/utils/server/database-tools";
import { articleSchema, articleCreateSchema, getDefaultNewArticle } from "~/types/articles";
import { type VSArticle, articleSelect } from "~/types/articles";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

export type ArticleResponse = {
  data?: VSArticle;
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  const id = req.query.id as string;

  // For GET requests, allow public access
  if (req.method === "GET") {
    if (id === "new") {
      // add timestamp to the title
      const defaultRecord = getDefaultNewArticle('Testpagina ' + new Date().toISOString());
      res.status(200).json({data: defaultRecord});
      return;
    }

    const article = (await prisma.articles.findFirst({
      where: {
        ID: id,
      },
      select: articleSelect
    })) as unknown as VSArticle;
    res.status(200).json({data: article});
    return;
  }

  // For POST/PUT/DELETE, require authentication and specific rights
  if (!session?.user) {
    console.error("Unauthorized - no session found");
    res.status(401).json({error: "Niet ingelogd - geen sessie gevonden"}); // Unauthorized
    return;
  }

  const hasInstellingenSiteContent = userHasRight(session?.user?.securityProfile, VSSecurityTopic.instellingen_site_content);
  if (!hasInstellingenSiteContent) {
    res.status(403).json({ error: "Access denied - insufficient permissions" });
    return;
  }

  const validateUserSessionResult = await validateUserSession(session, "articles");
  if ('error' in validateUserSessionResult) {
    console.error("Unauthorized - invalid session", validateUserSessionResult.error);
    res.status(401).json({error: validateUserSessionResult.error}); // Unauthorized
    return;
  }

  const { sites, userId } = validateUserSessionResult;
  // if (!sites.includes(id) && id !== "new") {
  //   console.error("Unauthorized - no access to this article", id);
  //   res.status(403).json({ error: "Geen toegang tot dit artikel" });
  //   return;
  // }

  switch (req.method) {
    case "POST": {
      try {

        const newID = generateID();
        const data = { ...req.body, ID: newID };

        const parseResult = articleCreateSchema.safeParse(data);
        if (!parseResult.success) {
          console.error("Invalid or missing data:", JSON.stringify(parseResult.error.errors,null,2));
          res.status(400).json({ error: parseResult.error.errors });
          return;
        }
        const parsed = parseResult.data;

        const newData = {
          ID: newID,
          // Required fields
          Title: parsed.Title,
          Status: "1", // Default status
          ModuleID: "veiligstallenprisma",
          DateCreated: new Date(),
          
          // Optional fields with defaults
          SiteID: parsed.SiteID ?? undefined,
          Language: parsed.Language ?? undefined,
          ParentID: parsed.ParentID ?? undefined,
          DisplayTitle: parsed.DisplayTitle ?? undefined,
          Abstract: parsed.Abstract ?? undefined,
          Article: parsed.Article ?? undefined,
          CustomField1_Title: parsed.CustomField1_Title ?? undefined,
          CustomField1: parsed.CustomField1 ?? undefined,
          Banner: parsed.Banner ?? undefined,
          Keywords: parsed.Keywords ?? undefined,
          SortOrder: parsed.SortOrder ?? undefined,
          PublishStartDate: parsed.PublishStartDate ?? undefined,
          PublishEndDate: parsed.PublishEndDate ?? undefined,
          Navigation: parsed.Navigation ?? undefined,
          ShowInNav: parsed.ShowInNav ?? undefined,
          System: parsed.System ?? "0",
          EditorCreated: parsed.EditorCreated ?? undefined,
          EditorModified: parsed.EditorModified ?? undefined,
          DateModified: parsed.DateModified ?? undefined,
        }

        const newArticle = await prisma.articles.create({data: newData, select: articleSelect}) as unknown as VSArticle;
        if(!newArticle) {
          console.error("Error creating new article:", newData);
          res.status(500).json({error: "Error creating new article"});
          return;
        }

        res.status(201).json({ 
          data: newArticle
        });
      } catch (e) {
        console.error("Error creating article:", e);
        res.status(500).json({error: "Error creating article"});
      }
      break;
    }
    case "PUT": {
      try {
        const parseResult = articleSchema.partial().safeParse(req.body);
        if (!parseResult.success) {
          console.error("Unexpected/missing data error:", parseResult.error);
          res.status(400).json({error: "Invalid or missing data"});
          return;
        }

        const parsed = parseResult.data;
        const updatedArticle = await prisma.articles.update({
          select: articleSelect,
          where: { ID: id },
          data: {
            Title: parsed.Title,
            DisplayTitle: parsed.DisplayTitle ?? undefined,
            Abstract: parsed.Abstract ?? undefined,
            Article: parsed.Article ?? undefined,
            CustomField1_Title: parsed.CustomField1_Title ?? undefined,
            CustomField1: parsed.CustomField1 ?? undefined,
            Banner: parsed.Banner ?? undefined,
            Keywords: parsed.Keywords ?? undefined,
            SortOrder: parsed.SortOrder ?? undefined,
            PublishStartDate: parsed.PublishStartDate === null ? null : parsed.PublishStartDate ? new Date(parsed.PublishStartDate) : undefined,
            PublishEndDate: parsed.PublishEndDate === null ? null : parsed.PublishEndDate ? new Date(parsed.PublishEndDate) : undefined,
            Status: parsed.Status ?? undefined,
            Navigation: parsed.Navigation ?? undefined,
            ShowInNav: parsed.ShowInNav ?? undefined,
            System: parsed.System ?? undefined,
            EditorModified: parsed.EditorModified ?? undefined,
            DateModified: parsed.DateModified === null ? null : parsed.DateModified ? new Date(parsed.DateModified) : undefined,
          }
        });
        res.status(200).json({data: updatedArticle});
      } catch (e) {
        if (e instanceof z.ZodError) {
          console.error("Invalid or missing data:", JSON.stringify(e.errors,null,2));
          res.status(400).json({ error: e.errors });
        } else {
          res.status(500).json({error: "Error updating article"});
        }
      }
      break;
    }
    case "DELETE": {
      try {
        await prisma.articles.delete({
          where: { ID: id }
        });
        res.status(200).json({});
      } catch (e) {
        console.error("Error deleting article:", e);
        res.status(500).json({error: "Error deleting article"});
      }
      break;
    }
    default: {
      res.status(405).json({error: "Method Not Allowed"}); // Method Not Allowed
    }
  }
}