import { type Prisma } from "~/generated/prisma-client";
import { prisma } from "~/server/db";
import type { NextApiRequest, NextApiResponse } from "next";
import type { VSFaqFull } from "~/types/faq";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (!req.query.siteId || Array.isArray(req.query.siteId)) return;
  // const theContact = await prisma.contacts.findFirst({
  //   where: {
  //     ID: req.query.siteId
  //   }
  // })

  // if (!theContact) return res.status(404).json({ error: 'Contact not found' });

  // Get FAQ sections for site
  const queryRequest: Prisma.contacts_faqFindManyArgs = {
    where: {
      Status: true,
      SiteID: req.query.siteId
    },
    select: {
      FaqID: true
    }
  }
  const faqsForContact = await prisma.contacts_faq.findMany(queryRequest);

  // Get FAQ section titles
  const faqSections = [];
  for await (const x of faqsForContact) {
    const faqItem = await prisma.faq.findFirst({
      where: {
        ID: x.FaqID,
        Status: '1',
      },
      select: {
        ID: true,
        Title: true,
        Question: true,
        Answer: true,
        SortOrder: true,
        ModuleID: true,
        Status: true
    },
      orderBy: {
        SortOrder: { sort: 'asc', nulls: 'last' },
      }
    });
    if (faqItem && faqItem.Title) {
      faqSections.push(faqItem);
    }
  }

  // Get FAQ answers
  const faqFull: VSFaqFull[] = [];
  for await (const section of faqSections) {
    const faqQuestionAndAnswers = await prisma.faq.findMany({
      where: {
        ParentID: section.ID,
        Status: '1'
      },
      select: {
        ID: true,
        Title: true,
        Question: true,
        Answer: true,
        SortOrder: true,
        ModuleID: true,
        Status: true
      },
      orderBy: {
        SortOrder: { sort: 'asc', nulls: 'last' },
      }
    });
    faqFull.push({
      sectionTitle: section.Title || '',
      q_and_a: faqQuestionAndAnswers || []
    });
  }

  res.json(faqFull);
}
