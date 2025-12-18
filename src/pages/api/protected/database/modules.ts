import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '~/pages/api/auth/[...nextauth]';
import { prisma } from '~/server/db';
import { VSSecurityTopic } from '~/types/securityprofile';
import { userHasRight } from '~/types/utils';

export type ModulesResponse = {
  data?: Array<{
    moduleID: string;
    moduleName: string | null;
    contacts: Array<{
      siteID: string;
      companyName: string | null;
    }>;
    contactsNotUsingModule: Array<{
      siteID: string;
      companyName: string | null;
    }>;
  }>;
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<ModulesResponse>
) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: 'Niet ingelogd - geen sessie gevonden' });
    return;
  }

  // Check user has fietsberaad_admin or fietsberaad_superadmin rights
  const hasFietsberaadAdmin = userHasRight(
    session.user.securityProfile,
    VSSecurityTopic.fietsberaad_admin
  );
  const hasFietsberaadSuperadmin = userHasRight(
    session.user.securityProfile,
    VSSecurityTopic.fietsberaad_superadmin
  );

  if (!hasFietsberaadAdmin && !hasFietsberaadSuperadmin) {
    res.status(403).json({ error: 'Access denied - insufficient permissions' });
    return;
  }

  try {
    // Fetch all modules first, excluding "Fiets en Win" (ID: "fietsenwin")
    const modules = await prisma.modules.findMany({
      where: {
        ID: {
          not: 'fietsenwin',
        },
      },
      orderBy: {
        Name: 'asc',
      },
    });

    // Fetch all modules_contacts, excluding "Fiets en Win" module
    const allModulesContacts = await prisma.modules_contacts.findMany({
      where: {
        ModuleID: {
          not: 'fietsenwin',
        },
      },
      select: {
        ModuleID: true,
        SiteID: true,
      },
    });

    // Fetch contacts for all SiteIDs that exist
    const siteIDs = [...new Set(allModulesContacts.map(mc => mc.SiteID))];
    const contacts = await prisma.contacts.findMany({
      where: {
        ID: {
          in: siteIDs,
        },
      },
      select: {
        ID: true,
        CompanyName: true,
      },
    });

    // Create a map of SiteID to CompanyName
    const contactMap = new Map<string, string | null>();
    for (const contact of contacts) {
      contactMap.set(contact.ID, contact.CompanyName);
    }

    // Fetch all organizations (contacts) that could potentially use modules
    const allOrganizations = await prisma.contacts.findMany({
      where: {
        ItemType: 'organizations',
      },
      select: {
        ID: true,
        CompanyName: true,
      },
    });

    // Create a map of all organization IDs
    const allOrgMap = new Map<string, string | null>();
    for (const org of allOrganizations) {
      allOrgMap.set(org.ID, org.CompanyName);
    }

    // Group contacts by module, only including contacts that exist
    const contactsByModule = new Map<string, Set<string>>();
    
    for (const mc of allModulesContacts) {
      // Only include if contact exists
      if (contactMap.has(mc.SiteID)) {
        if (!contactsByModule.has(mc.ModuleID)) {
          contactsByModule.set(mc.ModuleID, new Set());
        }
        contactsByModule.get(mc.ModuleID)!.add(mc.SiteID);
      }
    }

    // Transform the data to the desired format
    const modulesWithContacts = modules.map((module) => {
      const contactsWithModule = contactsByModule.get(module.ID) ?? new Set();
      const contactsWithModuleList = Array.from(contactsWithModule)
        .map(siteID => ({
          siteID,
          companyName: allOrgMap.get(siteID) ?? contactMap.get(siteID) ?? null,
        }))
        .filter(c => c.companyName !== null || allOrgMap.has(c.siteID));

      // Get contacts NOT using this module (all organizations minus those using it)
      const contactsNotUsingModule = Array.from(allOrgMap.keys())
        .filter(siteID => !contactsWithModule.has(siteID))
        .map(siteID => ({
          siteID,
          companyName: allOrgMap.get(siteID) ?? null,
        }));

      return {
        moduleID: module.ID,
        moduleName: module.Name,
        contacts: contactsWithModuleList,
        contactsNotUsingModule,
      };
    });

    res.status(200).json({ data: modulesWithContacts });
  } catch (error) {
    console.error('Error fetching modules:', error);
    res.status(500).json({
      error: 'Fout bij het ophalen van modules',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

