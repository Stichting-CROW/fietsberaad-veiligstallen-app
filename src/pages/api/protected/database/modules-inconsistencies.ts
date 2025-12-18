import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '~/pages/api/auth/[...nextauth]';
import { prisma } from '~/server/db';
import { VSSecurityTopic } from '~/types/securityprofile';
import { userHasRight } from '~/types/utils';

export type ModuleInconsistency = {
  organisatie: string;
  organisatieID: string;
  inconsistentie: string;
  details: string;
  parkings: Array<{
    title: string | null;
    plaats: string | null;
    exploitantCompanyName: string | null;
    editorCreated: string | null;
  }>;
};

export type ModulesInconsistenciesResponse = {
  data?: ModuleInconsistency[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<ModulesInconsistenciesResponse>
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
    // Fetch all parkings with their SiteID, Type, Title, Plaats, ExploitantID, and EditorCreated
    const parkings = await prisma.fietsenstallingen.findMany({
      where: {
        SiteID: {
          not: null,
        },
        Type: {
          in: ['buurtstalling', 'fietstrommel', 'fietskluizen'],
        },
      },
      select: {
        SiteID: true,
        Type: true,
        Title: true,
        Plaats: true,
        ExploitantID: true,
        EditorCreated: true,
      },
    });

    // Fetch all organizations with their modules
    const allModulesContacts = await prisma.modules_contacts.findMany({
      select: {
        ModuleID: true,
        SiteID: true,
      },
    });

    // Create a map of SiteID to enabled modules
    const modulesBySiteID = new Map<string, Set<string>>();
    for (const mc of allModulesContacts) {
      if (!modulesBySiteID.has(mc.SiteID)) {
        modulesBySiteID.set(mc.SiteID, new Set());
      }
      modulesBySiteID.get(mc.SiteID)!.add(mc.ModuleID);
    }

    // Fetch organization names
    const siteIDs = [...new Set(parkings.map(p => p.SiteID).filter(Boolean) as string[])];
    const organizations = await prisma.contacts.findMany({
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

    const orgNameMap = new Map<string, string | null>();
    for (const org of organizations) {
      orgNameMap.set(org.ID, org.CompanyName);
    }

    // Fetch exploitant names
    const exploitantIDs = [...new Set(parkings.map(p => p.ExploitantID).filter(Boolean) as string[])];
    const exploitanten = await prisma.contacts.findMany({
      where: {
        ID: {
          in: exploitantIDs,
        },
      },
      select: {
        ID: true,
        CompanyName: true,
      },
    });

    const exploitantNameMap = new Map<string, string | null>();
    for (const exploitant of exploitanten) {
      exploitantNameMap.set(exploitant.ID, exploitant.CompanyName);
    }

    // Group parkings by SiteID and Type, storing full parking objects
    const parkingsBySiteAndType = new Map<string, Map<string, Array<{ title: string | null; plaats: string | null; exploitantCompanyName: string | null; editorCreated: string | null }>>>();
    for (const parking of parkings) {
      if (!parking.SiteID || !parking.Type) continue;
      
      const key = parking.SiteID;
      if (!parkingsBySiteAndType.has(key)) {
        parkingsBySiteAndType.set(key, new Map());
      }
      const typeMap = parkingsBySiteAndType.get(key)!;
      if (!typeMap.has(parking.Type)) {
        typeMap.set(parking.Type, []);
      }
      typeMap.get(parking.Type)!.push({
        title: parking.Title,
        plaats: parking.Plaats,
        exploitantCompanyName: parking.ExploitantID ? exploitantNameMap.get(parking.ExploitantID) || null : null,
        editorCreated: parking.EditorCreated,
      });
    }

    // Find inconsistencies
    const inconsistencies: ModuleInconsistency[] = [];

    for (const [siteID, typeMap] of parkingsBySiteAndType.entries()) {
      const enabledModules = modulesBySiteID.get(siteID) || new Set<string>();
      const orgName = orgNameMap.get(siteID) || siteID;

      // Check buurtstalling
      const buurtstallingParkings = typeMap.get('buurtstalling') || [];
      if (buurtstallingParkings.length > 0 && !enabledModules.has('buurtstallingen')) {
        const count = buurtstallingParkings.length;
        const buurtstallingText = count === 1 ? 'buurtstalling' : 'buurtstallingen';
        inconsistencies.push({
          organisatie: orgName,
          organisatieID: siteID,
          inconsistentie: 'buurtstallingen',
          details: `${count} ${buurtstallingText} zonder buurtstallingen module`,
          parkings: buurtstallingParkings,
        });
      }

      // Check fietstrommel
      const fietstrommelParkings = typeMap.get('fietstrommel') || [];
      if (fietstrommelParkings.length > 0 && !enabledModules.has('buurtstallingen')) {
        const count = fietstrommelParkings.length;
        const fietstrommelText = count === 1 ? 'fietstrommel' : 'fietstrommels';
        inconsistencies.push({
          organisatie: orgName,
          organisatieID: siteID,
          inconsistentie: 'buurtstallingen',
          details: `${count} ${fietstrommelText} zonder buurtstallingen module`,
          parkings: fietstrommelParkings,
        });
      }

      // Check fietskluizen
      const fietskluizenParkings = typeMap.get('fietskluizen') || [];
      if (fietskluizenParkings.length > 0 && !enabledModules.has('fietskluizen')) {
        const count = fietskluizenParkings.length;
        const fietskluisText = count === 1 ? 'fietskluis' : 'fietskluizen';
        inconsistencies.push({
          organisatie: orgName,
          organisatieID: siteID,
          inconsistentie: 'fietskluizen',
          details: `${count} ${fietskluisText} zonder fietskluizen module`,
          parkings: fietskluizenParkings,
        });
      }
    }

    // Sort by organization name, then by inconsistentie
    inconsistencies.sort((a, b) => {
      const orgCompare = (a.organisatie || '').localeCompare(b.organisatie || '');
      if (orgCompare !== 0) return orgCompare;
      return a.inconsistentie.localeCompare(b.inconsistentie);
    });

    res.status(200).json({ data: inconsistencies });
  } catch (error) {
    console.error('Error fetching module inconsistencies:', error);
    res.status(500).json({
      error: 'Fout bij het ophalen van inconsistente data',
      details: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

