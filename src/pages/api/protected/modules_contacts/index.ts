import { prisma } from "~/server/db";
import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { validateUserSession } from "~/utils/server/database-tools";
import type { Prisma } from "~/generated/prisma-client";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.error("Unauthorized - no session found");
    return res.status(401).json({ error: "Niet ingelogd - geen sessie gevonden" });
  }

  const validateUserSessionResult = await validateUserSession(session, "organizations");
  if ('error' in validateUserSessionResult) {
    console.error("Unauthorized - invalid session", validateUserSessionResult.error);
    return res.status(401).json({ error: validateUserSessionResult.error });
  }

  const { sites } = validateUserSessionResult;

  switch (req.method) {
    case "GET": {
      try {
        const { contactId } = req.query;
        
        if (!contactId || Array.isArray(contactId)) {
          const allModulesContacts = await prisma.modules_contacts.findMany({
            where: {
              SiteID: {
                in: sites
              }
            },
            include: {
              module: {
                select: {
                  ID: true,
                  Name: true,
                  parent: true
                }
              },
              contact: {
                select: {
                  ID: true,
                  CompanyName: true,
                  ItemType: true
                }
              }
            }
          });

          return res.status(200).json(allModulesContacts);
        }

        if (!sites.includes(contactId)) {
          console.error("Unauthorized - no access to this organization", contactId);
          return res.status(403).json({ error: "Geen toegang tot deze organisatie" });
        }

        const modulesContacts = await prisma.modules_contacts.findMany({
          where: {
            SiteID: contactId
          },
          include: {
            module: {
              select: {
                ID: true,
                Name: true,
                parent: true
              }
            },
            contact: {
              select: {
                ID: true,
                CompanyName: true,
                ItemType: true
              }
            }
          }
        });

        return res.status(200).json(modulesContacts);
      } catch (error) {
        console.error("Error fetching modules_contacts:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    }

    case "POST": {
      // Only fietsberaad admins can create modules
      if (session.user.mainContactId !== "1") {
        console.error("Unauthorized - only fietsberaad admins can create modules");
        return res.status(403).json({ error: "Alleen fietsberaad beheerders kunnen modules toevoegen" });
      }

      try {
        const data: Prisma.modules_contactsCreateManyInput = req.body;
        
        if (data.SiteID && !sites.includes(data.SiteID)) {
          console.error("Unauthorized - no access to this organization", data.SiteID);
          return res.status(403).json({ error: "Geen toegang tot deze organisatie" });
        }

        const createManyResponse = await prisma.modules_contacts.createMany({
          data
        });

        return res.status(200).json(createManyResponse);
      } catch (error) {
        console.error("Error creating modules_contacts:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    }

    case "PUT": {
      // Only fietsberaad admins can update modules
      if (session.user.mainContactId !== "1") {
        console.error("Unauthorized - only fietsberaad admins can update modules");
        return res.status(403).json({ error: "Alleen fietsberaad beheerders kunnen modules wijzigen" });
      }

      try {
        const { contactId } = req.query;
        const data = req.body;
        
        if (!contactId || Array.isArray(contactId)) {
          return res.status(400).json({ error: "Contact ID is required" });
        }

        if (!sites.includes(contactId)) {
          console.error("Unauthorized - no access to this organization", contactId);
          return res.status(403).json({ error: "Geen toegang tot deze organisatie" });
        }

        const [moduleId, siteId] = data.id.split('|');
        
        const result = await prisma.modules_contacts.update({
          where: { 
            ModuleID_SiteID: {
              ModuleID: moduleId,
              SiteID: siteId
            }
          },
          data: {
            ModuleID: data.ModuleID,
            SiteID: data.SiteID
          },
          include: {
            module: {
              select: {
                ID: true,
                Name: true,
                parent: true
              }
            },
            contact: {
              select: {
                ID: true,
                CompanyName: true,
                ItemType: true
              }
            }
          }
        });

        return res.status(200).json(result);
      } catch (error) {
        console.error("Error updating modules_contacts:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    }

    case "DELETE": {
      // Only fietsberaad admins can delete modules
      if (session.user.mainContactId !== "1") {
        console.error("Unauthorized - only fietsberaad admins can delete modules");
        return res.status(403).json({ error: "Alleen fietsberaad beheerders kunnen modules verwijderen" });
      }

      try {
        const { contactId } = req.query;
        
        if (!contactId || Array.isArray(contactId)) {
          return res.status(400).json({ error: "Contact ID is required" });
        }

        if (!sites.includes(contactId)) {
          console.error("Unauthorized - no access to this organization", contactId);
          return res.status(403).json({ error: "Geen toegang tot deze organisatie" });
        }

        const result = await prisma.modules_contacts.deleteMany({
          where: {
            SiteID: contactId
          }
        });

        return res.status(200).json(result);
      } catch (error) {
        console.error("Error deleting modules_contacts:", error);
        return res.status(500).json({ error: "Internal server error" });
      }
    }

    default:
      return res.status(405).json({ error: "Method not allowed" });
  }
} 