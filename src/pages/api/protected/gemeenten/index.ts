import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { type VSContactGemeente, type VSContactGemeenteInLijst, gemeenteSelect, gemeenteLijstSelect } from "~/types/contacts";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { validateUserSession } from "~/utils/server/database-tools";

export type GemeentenResponse = {
  data?: VSContactGemeente[] | VSContactGemeenteInLijst[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  const validateUserSessionResult = await validateUserSession(session, "organizations");
  
  if ('error' in validateUserSessionResult) {
    res.status(validateUserSessionResult.status).json({exploitanten: []});
    return;
  }

  const { sites } = validateUserSessionResult;

  switch (req.method) {
    case "GET": {
      // Check if compact mode is requested
      const compact = req.query.compact === 'true';
      
      // GET all organizations user can access
      const gemeenten = (await prisma.contacts.findMany({
        where: {
          ItemType: "organizations",
          ID: { in: sites }
        },
        select: compact ? gemeenteLijstSelect : gemeenteSelect
      }));

      if(compact) {
        const data: VSContactGemeenteInLijst[] = [];

        // Get all SiteIDs that have users in a single query
        const sitesWithUsers = await prisma.security_users.findMany({
          where: {
            user_contact_roles: {
              some: {
                ContactID: {
                  in: gemeenten.map(g => g.ID)
                }
              }
            }
          },
          select: {
            user_contact_roles: {
              select: {
                ContactID: true
              }
            }
          }
        });

        // Create a Set of ContactIDs for O(1) lookup
        const contactIdsWithUsers = new Set(
          sitesWithUsers.flatMap(user => 
            user.user_contact_roles.map(role => role.ContactID)
          )
        );

        for(const gemeente of gemeenten) {
          const hasUsers = contactIdsWithUsers.has(gemeente.ID);
          const hasExploitanten = (gemeente.isManagedByContacts?.length || 0) > 0;
          const hasStallingen = gemeente.fietsenstallingen_fietsenstallingen_SiteIDTocontacts.length > 0;
          
          data.push({
            ID: gemeente.ID,
            CompanyName: gemeente.CompanyName,
            CompanyLogo: gemeente.CompanyLogo,
            ThemeColor1: gemeente.ThemeColor1,
            ThemeColor2: gemeente.ThemeColor2,
            hasStallingen,
            hasUsers,
            hasExploitanten
          })
        }
        res.status(200).json({data})
      } else {
        res.status(200).json({data: gemeenten})
      }
      break;
    }
    default: {
      res.status(405).json({error: "Method Not Allowed"}); // Method Not Allowed
    }
  }
}