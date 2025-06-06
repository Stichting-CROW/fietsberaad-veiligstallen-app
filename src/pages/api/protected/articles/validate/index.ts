import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { type VSArticle, articleSelect } from "~/types/articles";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { validateUserSession } from "~/utils/server/database-tools";
import { articleSchema } from "~/types/articles";

export type ArticleValidateResponse = {
  valid: boolean;
  message: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.error("Unauthorized - no session found");
    res.status(401).json({valid: false, error: "Niet ingelogd - geen sessie gevonden"}); // Unauthorized
    return;
  }

  const validateUserSessionResult = await validateUserSession(session, "articles");
  if ('error' in validateUserSessionResult) {
    console.error("Unauthorized - invalid session", validateUserSessionResult.error);
    res.status(401).json({valid: false, error: validateUserSessionResult.error}); // Unauthorized
    return;
  }

  // get id from the query params and the data from the body
  const data = req.body as VSArticle | undefined;
  if(!data) {
    res.status(400).json({valid: false, message: "No data provided"});
    return;
  }

  if(!data.ID) {
    res.status(200).json({valid: false, message: "No ID provided"});
    return;
  }

  if (!validateUserSessionResult.sites.includes(data.ID) && data.ID !== "new") {
    res.status(403).json({ valid: false, error: "No access to this article" });
    return;
  }

  switch (req.method) {
    case "POST": {
      // check data against zod schema
      let parseResult;
      const isNew = data.ID === "new";
      if(isNew) {
        parseResult = articleSchema.omit({ID: true}).safeParse(data); // will be set later
      } else {
        parseResult = articleSchema.safeParse(data);
      }

      if (!parseResult.success) {
        res.status(200).json({valid: false, message: parseResult.error.issues.map(e => e.message).join(", ")});
        return;
      }

      // Check for unique fields
      const uniqueFields: {field: keyof VSArticle, message: string}[] = [
        {field: "Title", message: "An article with this title already exists"}
      ];

      const oldValues = !isNew ? await prisma.articles.findUnique({
        where: {
          ID: data.ID,
        },
        select: articleSelect
      }) : undefined;

      for(const field of uniqueFields) {
        const isChanged = oldValues && (oldValues?.[field.field] !== data[field.field]);
        // check if the field value has changed
        if(isNew || isChanged) {
          const duplicate = await prisma.articles.findFirst({
            where: {
              [field.field]: data[field.field],
            },
          });

          if(duplicate) {
            res.status(200).json({valid: false, message: field.message});
            return;
          }      
        }
      }

      res.status(200).json({valid: true, message: ""});
      break;
    }
   default: {
      res.status(405).json({valid: false, message: "Method Not Allowed"}); // Method Not Allowed
    }
  }
} 