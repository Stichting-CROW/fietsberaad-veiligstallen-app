import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { validateUserSession, getOrganisationTypeByID } from "~/utils/server/database-tools";
import { VSContactItemType } from "~/types/contacts";

export interface FietsenstallingenReportRow {
  title: string | null;
  plaats: string | null;
  type: string | null;
  dataeigenaar: string;
  exploitant: string;
  exploitantID: string | null;
  status: string | null;
  beheerderField: string | null;
  beheerderContact: string | null;
  helpdeskHandmatigIngesteld: boolean | null;
  siteHelpdesk: string;
  exploitantHelpdesk: string;
  helpdesk: string;
  helpdeskoud: string;
}

/* 

old display: 
  exploitant not set, beheerder not set -> dont display beheerder section
  exploitant not set, beheerder set -> visible (clickable if beheerderContact is set)
  exploitant set, beheerder not set -> visible (default helpdesk)
  exploitant set, beheerder set  -> visible (default helpdesk)

new display:
  hepdesk standaard -> visible
     exploitant not set -> visible (company name data owner, default helpdesk data-owner)
     exploitant set -> visible (company name exploitant, default helpdesk exploitant) [new]
  helpdesk anders -> visible (beheerder, beheerder contact)

  control is not shown if beheerder or beheerdercontact are not set

*/



export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  // Require authentication
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.error("Unauthorized - no session found");
    res.status(401).json({error: "Niet ingelogd - geen sessie gevonden"});
    return;
  }

  // Check rapportages access rights (same as other test pages)
  const hasAccess = userHasRight(session.user.securityProfile, VSSecurityTopic.rapportages);
  if (!hasAccess) {
    console.error("Access denied - insufficient permissions");
    res.status(403).json({error: "Access denied - insufficient permissions"});
    return;
  }

  try {
    if (req.method === 'GET') {
      // Validate user session and get accessible sites
      const validation = await validateUserSession(session);
      if ("error" in validation) {
        console.error("Validation error:", validation.error);
        return res.status(validation.status).json({ error: validation.error });
      }

      const { sites, activeContactId } = validation;

      // Check if active organization is Fietsberaad
      const isFietsberaad = activeContactId === "1";

      // Check if active organization is an exploitant
      const activeContactItemType = activeContactId ? await getOrganisationTypeByID(activeContactId) : null;
      const isExploitant = activeContactItemType === VSContactItemType.Exploitant;

      // Build WHERE clause for site filtering with proper escaping
      // Only show data for the active organization
      let siteFilter = "";
      
      if (isFietsberaad) {
        // Fietsberaad: show all stallingen (no site filter)
        siteFilter = `WHERE f.Title NOT LIKE '%Systeemstalling%'`;
      } else if (isExploitant && activeContactId) {
        // Exploitant: show all stallingen managed by this exploitant (active organization)
        const escapedExploitant = `'${String(activeContactId).replace(/'/g, "''")}'`;
        siteFilter = `WHERE f.ExploitantID = ${escapedExploitant} AND f.Title NOT LIKE '%Systeemstalling%'`;
      } else if (activeContactId) {
        // Other organizations (gemeenten): only show stallingen from active organization
        const escapedSite = `'${String(activeContactId).replace(/'/g, "''")}'`;
        siteFilter = `WHERE f.SiteID = ${escapedSite} AND f.Title NOT LIKE '%Systeemstalling%'`;
      } else {
        // No active organization: return empty result
        siteFilter = `WHERE 1=0`;
      }

      // Query to get all fietsenstallingen with beheerder and helpdesk information
      // beheerder: contact companyname via exploitantID or "" for null
      // helpdesk: same logic as beheerder view component
      //   - if SiteID === ExploitantID: use gemeente Helpdesk
      //   - else if exploitant exists: use exploitant Helpdesk
      //   - else if BeheerderContact !== null: use BeheerderContact
      //   - else: ""
      const sql = `
        SELECT 
          f.Title AS title,
          f.Plaats AS plaats,
          f.Type AS type,
          COALESCE(c_site.CompanyName, '') AS dataeigenaar,
          COALESCE(c_exploitant.CompanyName, '') AS exploitant,
          f.ExploitantID AS exploitantID,
          f.Status AS status,
          f.Beheerder AS beheerderField,
          f.BeheerderContact AS beheerderContact,
          f.HelpdeskHandmatigIngesteld AS helpdeskHandmatigIngesteld,
          COALESCE(c_site.Helpdesk, '') AS siteHelpdesk,
          COALESCE(c_exploitant.Helpdesk, '') AS exploitantHelpdesk
        FROM fietsenstallingen f
        LEFT JOIN contacts c_exploitant ON f.ExploitantID = c_exploitant.ID
        LEFT JOIN contacts c_site ON f.SiteID = c_site.ID
        ${siteFilter}
        ORDER BY f.Title
      `;

      const results = await prisma.$queryRawUnsafe<FietsenstallingenReportRow[]>(sql);

      res.status(200).json(results);
    } else {
      res.status(405).end(); // Method Not Allowed
    }
  } catch (error) {
    console.error('Error fetching fietsenstallingen report:', error);
    res.status(500).json({ error: "Internal server error" });
  }
}

