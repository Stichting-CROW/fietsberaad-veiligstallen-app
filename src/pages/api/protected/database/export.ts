import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";

type ExportRow = {
  data_eigenaar: string | null;
  titel: string | null;
  stallings_id: string | null;
  soort_stalling: string | null;
  status: string | null;
  totale_capaciteit: bigint;
  coordinaten: string | null;
  url: string | null;
  date_modified: Date | null;
};

/**
 * Escape and quote CSV field value (for string fields)
 */
const escapeCsvField = (value: any): string => {
  if (value === null || value === undefined) {
    return '""';
  }
  
  const str = String(value);
  // Replace quotes with double quotes and wrap in quotes
  const escaped = str.replace(/"/g, '""');
  return `"${escaped}"`;
};

/**
 * Format numeric field for CSV (no quotes)
 */
const formatNumericField = (value: any): string => {
  if (value === null || value === undefined) {
    return '';
  }
  return String(value);
};

/**
 * Format date for CSV (YYYY-MM-DD HH:MM:SS)
 * Returns empty string for null/invalid dates - caller should use escapeCsvField
 */
const formatDate = (date: Date | null | undefined): string => {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, '0');
  const day = String(d.getUTCDate()).padStart(2, '0');
  const hours = String(d.getUTCHours()).padStart(2, '0');
  const minutes = String(d.getUTCMinutes()).padStart(2, '0');
  const seconds = String(d.getUTCSeconds()).padStart(2, '0');
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Niet ingelogd - geen sessie gevonden" });
    return;
  }

  // Check user has fietsberaad_admin or fietsberaad_superadmin rights
  const hasFietsberaadAdmin = userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_admin);
  const hasFietsberaadSuperadmin = userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin);
  
  if (!hasFietsberaadAdmin && !hasFietsberaadSuperadmin) {
    res.status(403).json({ error: "Access denied - insufficient permissions" });
    return;
  }

  const { table } = req.query;

  if (table !== 'fietsenstallingen') {
    res.status(400).json({ error: "Only 'fietsenstallingen' table is supported" });
    return;
  }

  try {
    // Single optimized SQL query to fetch all data with capacity calculation
    // Using LEFT JOIN with GROUP BY instead of correlated subquery for better performance
    const sql = `
      SELECT 
        c.CompanyName as data_eigenaar,
        f.Title as titel,
        f.StallingsID as stallings_id,
        ft.name as soort_stalling,
        f.Status as status,
        COALESCE(SUM(CASE 
          WHEN fs.isactief = 1 AND (sft.Toegestaan IS NULL OR sft.Toegestaan = 1) 
          THEN sft.Capaciteit 
          ELSE 0 
        END), 0) as totale_capaciteit,
        f.Coordinaten as coordinaten,
        f.Url as url,
        f.DateModified as date_modified
      FROM fietsenstallingen f
      LEFT JOIN contacts c ON f.SiteID = c.ID
      LEFT JOIN fietsenstallingtypen ft ON f.Type = ft.id
      LEFT JOIN fietsenstalling_sectie fs ON fs.fietsenstallingsId = f.ID
      LEFT JOIN sectie_fietstype sft ON fs.sectieId = sft.sectieID
      GROUP BY f.ID, c.CompanyName, f.Title, f.StallingsID, ft.name, f.Status, f.Coordinaten, f.Url, f.DateModified
      ORDER BY c.CompanyName ASC, ft.name ASC, f.Title ASC
    `;

    const results = await prisma.$queryRawUnsafe<ExportRow[]>(sql);

    // Build CSV
    const rows: string[] = [];
    
    // Header row
    const headers = [
      'Data-eigenaar',
      'Titel',
      'StallingsID',
      'Soort stalling',
      'Status',
      'Totale capaciteit',
      'Latitude',
      'Longitude',
      'Url',
      'Laatst bewerkt (UTC)'
    ];
    rows.push(headers.map(escapeCsvField).join(','));

    // Data rows
    for (const row of results) {
      // Parse coordinates
      let latitude = '';
      let longitude = '';
      if (row.coordinaten) {
        const coords = row.coordinaten.split(',');
        if (coords.length >= 2) {
          latitude = coords[0]?.trim() || '';
          longitude = coords[1]?.trim() || '';
        }
      }

      // Build CSV row with proper quoting: strings quoted, numbers unquoted
      const csvRow = [
        escapeCsvField(row.data_eigenaar || ''),           // String - quoted
        escapeCsvField(row.titel || ''),                   // String - quoted
        escapeCsvField(row.stallings_id || ''),            // String - quoted
        escapeCsvField(row.soort_stalling || ''),         // String - quoted
        escapeCsvField(row.status || ''),                  // String - quoted
        formatNumericField(Number(row.totale_capaciteit)), // Number - unquoted
        escapeCsvField(latitude),                         // String - quoted
        escapeCsvField(longitude),                         // String - quoted
        escapeCsvField(row.url || ''),                     // String - quoted
        escapeCsvField(row.date_modified ? formatDate(row.date_modified) : '') // Date string - quoted
      ];

      rows.push(csvRow.join(','));
    }

    const csvContent = rows.join('\n');

    // Set response headers for CSV download
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${table}_export_${new Date().toISOString().split('T')[0]}.csv"`);
    res.setHeader('Content-Length', Buffer.byteLength(csvContent, 'utf8').toString());

    res.status(200).send(csvContent);
  } catch (error) {
    console.error("Error exporting data:", error);
    res.status(500).json({ error: "An error occurred while exporting data" });
  }
}

