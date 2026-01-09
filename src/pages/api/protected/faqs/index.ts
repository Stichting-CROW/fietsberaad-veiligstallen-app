import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import type { Prisma } from "~/generated/prisma-client";
import { type VSContactsFAQ, type VSFAQ } from "~/types/faq";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { validateUserSession } from "~/utils/server/database-tools";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

export type FaqsResponse = {
  data?: VSFAQ[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  
  // For GET requests, allow public access (no authentication required)
  if (req.method === "GET") {
    // Continue with the existing GET logic without authentication checks
  } else {
    // For POST/PUT/DELETE, require authentication and specific rights
    if (!session?.user) {
      res.status(401).json({ error: "Authentication required" });
      return;
    }

    const hasInstellingenSiteContentFaq = userHasRight(session?.user?.securityProfile, VSSecurityTopic.instellingen_site_content_faq);
    if (!hasInstellingenSiteContentFaq) {
      res.status(403).json({ error: "Access denied - insufficient permissions" });
      return;
    }
  }

  // For GET requests, we need to handle the case where session might be null
  if (req.method === "GET") {
    // For GET requests, we'll use a simplified approach that doesn't require session validation
    const activeContactId = session?.user?.activeContactId;
    
    // Define the sites we want to get FAQs for
    const sitesToGetFaqsFor = () => {
      // If SiteID is provided as query parameter, we want to get FAQs for that site
      if (req.query.SiteID) {
        return [req.query.SiteID as string];
      }
      // If there's an active contact ID and no SiteID is provided
      // -> Get FAQs for that contact
      else if (activeContactId) {
        return [activeContactId];
      }
      // Otherwise, don't get FAQs
      return [];
    }

    // Get FAQs for the sites we want to get FAQs for
    const where_faqs: Prisma.contacts_faqWhereInput = {
      SiteID: { in: sitesToGetFaqsFor() },
      Status: true
    };
    const query_faqs: Prisma.contacts_faqFindManyArgs = {
      where: where_faqs
    }
    const contacts_faq = await prisma.contacts_faq.findMany(query_faqs) as unknown as VSContactsFAQ[];

    // Now get FAQ sections and FAQ items for these FAQs
    const where_faq_items: Prisma.faqWhereInput = {
      ID: { in: contacts_faq.map(faq => faq.FaqID) },
    };
    const query: Prisma.faqFindManyArgs = {
      where: where_faq_items,
      orderBy: {
        SortOrder: 'asc'
      }
    }

    const faqs = await prisma.faq.findMany(query) as unknown as VSFAQ[];

    // Every section has a Title
    // Every item has a Question and Answer
    const sections = faqs.filter((faq: VSFAQ) => faq.Title !== null);
    const items = faqs.filter((faq: VSFAQ) => faq.Title === null);

    res.status(200).json({data: {
      sections: sections,
      items: items
    }});
    return;
  } else {
    // For POST/PUT/DELETE, use the existing validation logic
    const validateUserSessionResult = await validateUserSession(session, "faqs");
    
    if ('error' in validateUserSessionResult) {
      res.status(validateUserSessionResult.status).json({faqs: []});
      return;
    }

    const { sites } = validateUserSessionResult;
    const activeContactId = session?.user?.activeContactId;

    switch (req.method) {
      // Only POST/PUT/DELETE methods are handled here since GET is handled above
      default: {
        res.status(405).json({error: "Method Not Allowed"}); // Method Not Allowed
      }
    }
  }
}
