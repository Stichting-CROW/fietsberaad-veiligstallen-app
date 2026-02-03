import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";

type ExportRow = {
  id: string | null;
  data_eigenaar: string | null;
  data_eigenaar_gemeentecode: number | null;
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

  const { table, statistics } = req.query;

  if (table !== 'fietsenstallingen') {
    res.status(400).json({ error: "Only 'fietsenstallingen' table is supported" });
    return;
  }

  try {
    // Single optimized SQL query to fetch all data with capacity calculation
    // Using LEFT JOIN with GROUP BY instead of correlated subquery for better performance
    const sql = `
      SELECT 
        f.ID as id,
        c.CompanyName as data_eigenaar,
        c.Gemeentecode as data_eigenaar_gemeentecode,
        c.UrlName as data_eigenaar_urlname,
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
        f.DateModified as date_modified
      FROM fietsenstallingen f
      LEFT JOIN contacts c ON f.SiteID = c.ID
      LEFT JOIN fietsenstallingtypen ft ON f.Type = ft.id
      LEFT JOIN fietsenstalling_sectie fs ON fs.fietsenstallingsId = f.ID
      LEFT JOIN sectie_fietstype sft ON fs.sectieId = sft.sectieID
      WHERE f.Title NOT LIKE '%Systeemstalling%'
      GROUP BY f.ID, c.CompanyName, c.Gemeentecode, f.Title, f.StallingsID, ft.name, f.Status, f.Coordinaten, f.Url, f.DateModified
      ORDER BY c.CompanyName ASC, ft.name ASC, f.Title ASC
    `;

    const results = await prisma.$queryRawUnsafe<ExportRow[]>(sql);

    // Type definitions for stats results
    type StatsRow = {
      stallings_id: string;
      eerste_datum: Date | null;
      laatste_datum: Date | null;
      totaal_aantal_transacties?: number | bigint;
      totaal_aantal_cacherecords?: number | bigint;
      som_totaal_transacties?: number | bigint | string;
      aantal_checkins?: number | bigint;
      aantal_checkouts?: number | bigint;
    };

    let bezettingsdataMap: Map<string, StatsRow> = new Map();
    let transactiesArchiefCacheMap: Map<string, StatsRow> = new Map();
    let stallingsduurCacheMap: Map<string, StatsRow> = new Map();

    if(statistics === 'true') {

      // Bezettingsdata cache: first cache record date, last cache record date, total cache records, separate checkins and checkouts, per stallingid
      // Optimized: Uses composite index (bikeparkID, timestamp), ORDER BY removed
      const sqlDataInfoBezettingsdata_day_hour_cache = `
        SELECT 
          bikeparkID as stallings_id,
          MIN(timestamp) as eerste_datum,
          MAX(timestamp) as laatste_datum,
          COUNT(*) as totaal_aantal_cacherecords,
          COALESCE(SUM(totalCheckins), 0) as aantal_checkins,
          COALESCE(SUM(totalCheckouts), 0) as aantal_checkouts
        FROM bezettingsdata_day_hour_cache
        WHERE bikeparkID IS NOT NULL
        GROUP BY bikeparkID
      `;

      // Transacties archief day cache: first cache record date, last cache record date, total cache records, separate checkins and checkouts, per stallingid
      // Note: This table only has count_transacties (total), not split by checkins/checkouts
      // Optimized: Uses composite index (locationID, checkoutdate), ORDER BY removed
      const sqlDataInfoTransacties_archief_day_cache = `
        SELECT 
          locationID as stallings_id,
          MIN(checkoutdate) as eerste_datum,
          MAX(checkoutdate) as laatste_datum,
          COUNT(*) as totaal_aantal_cacherecords,
          COALESCE(SUM(count_transacties), 0) as aantal_checkins,
          COALESCE(SUM(count_transacties), 0) as aantal_checkouts
        FROM transacties_archief_day_cache
        WHERE locationID IS NOT NULL
        GROUP BY locationID
      `;

      // Stallingsduur cache: first cache record date, last cache record date, total cache records, separate checkins and checkouts, per stallingid
      // Note: This table only has count_transacties (total), not split by checkins/checkouts
      // Optimized: Uses index on locationID, ORDER BY removed
      const sqlDataInfoStallingsduur_cache = `
        SELECT 
          locationID as stallings_id,
          MIN(checkoutdate) as eerste_datum,
          MAX(checkoutdate) as laatste_datum,
          COUNT(*) as totaal_aantal_cacherecords,
          COALESCE(SUM(count_transacties), 0) as aantal_checkins,
          COALESCE(SUM(count_transacties), 0) as aantal_checkouts
        FROM stallingsduur_cache
        WHERE locationID IS NOT NULL
        GROUP BY locationID
      `;

      // Fetch all stats sequentially with progress logging
      console.log('[Export] Starting stats queries...');
      
      console.log('[Export] Querying bezettingsdata_day_hour_cache stats...');
      const startBezettingsdata = Date.now();
      const bezettingsdataStats = await prisma.$queryRawUnsafe<StatsRow[]>(sqlDataInfoBezettingsdata_day_hour_cache);
      console.log(`[Export] Bezettingsdata cache stats completed in ${Date.now() - startBezettingsdata}ms (${bezettingsdataStats.length} records)`);
      
      console.log('[Export] Querying transacties_archief_day_cache stats...');
      const startTransactiesArchiefCache = Date.now();
      const transactiesArchiefCacheStats = await prisma.$queryRawUnsafe<StatsRow[]>(sqlDataInfoTransacties_archief_day_cache);
      console.log(`[Export] Transacties archief cache stats completed in ${Date.now() - startTransactiesArchiefCache}ms (${transactiesArchiefCacheStats.length} records)`);
      
      console.log('[Export] Querying stallingsduur_cache stats...');
      const startStallingsduur = Date.now();
      const stallingsduurCacheStats = await prisma.$queryRawUnsafe<StatsRow[]>(sqlDataInfoStallingsduur_cache);
      console.log(`[Export] Stallingsduur cache stats completed in ${Date.now() - startStallingsduur}ms (${stallingsduurCacheStats.length} records)`);
      
      console.log('[Export] All stats queries completed');

      // Create lookup maps by stalling_id
      bezettingsdataMap = new Map<string, StatsRow>();
      bezettingsdataStats.forEach(row => {
        bezettingsdataMap.set(row.stallings_id, row);
      });

      transactiesArchiefCacheMap = new Map<string, StatsRow>();
      transactiesArchiefCacheStats.forEach(row => {
        transactiesArchiefCacheMap.set(row.stallings_id, row);
      });

      stallingsduurCacheMap = new Map<string, StatsRow>();
      stallingsduurCacheStats.forEach(row => {
        stallingsduurCacheMap.set(row.stallings_id, row);
      });
    }

    // Build CSV
    const rows: string[] = [];
    
    // Header row
    const headers = [
      'Data-eigenaar',
      'CBS Code Dataeigenaar',
      'Titel',
      'StallingsID',
      'Soort stalling',
      'Status',
      'Totale capaciteit',
      'Locatie',
      'Url',
      'Laatst bewerkt (UTC)'];

    if(statistics === 'true') {
      headers.push(...[
      'Bezettingsdata Cache - Eerste datum',
      'Bezettingsdata Cache - Laatste datum',
      'Bezettingsdata Cache - Aantal records',
      'Bezettingsdata Cache - Aantal checkins',
      'Bezettingsdata Cache - Aantal checkouts',
      'Transacties Archief Cache - Eerste datum',
      'Transacties Archief Cache - Laatste datum',
      'Transacties Archief Cache - Aantal records',
      'Transacties Archief Cache - Aantal checkins',
      'Transacties Archief Cache - Aantal checkouts',
      'Stallingsduur Cache - Eerste datum',
      'Stallingsduur Cache - Laatste datum',
      'Stallingsduur Cache - Aantal records',
      'Stallingsduur Cache - Aantal checkins',
      'Stallingsduur Cache - Aantal checkouts'
    ]);
    }
    rows.push(headers.map(escapeCsvField).join(','));

    // Data rows
    for (const row of results) {
      const stallingId = row.stallings_id || '';
      // Format gemeentecode as 4 characters with leading zeros
      const gemeentecodeFormatted = row.data_eigenaar_gemeentecode 
        ? String(row.data_eigenaar_gemeentecode).padStart(4, '0')
        : '';
      
      const csvRow = [
        escapeCsvField(row.data_eigenaar || ''),           // String - quoted
        escapeCsvField(gemeentecodeFormatted),              // String - quoted (4 chars with leading zeros)
        escapeCsvField(row.titel || ''),                   // String - quoted
        escapeCsvField(row.stallings_id || ''),            // String - quoted
        escapeCsvField(row.soort_stalling || ''),         // String - quoted
        escapeCsvField(row.status || ''),                  // String - quoted
        formatNumericField(Number(row.totale_capaciteit)), // Number - unquoted
        escapeCsvField(row.coordinaten||''),               // String - quoted
        escapeCsvField(`https://beta.veiligstallen.nl/${(row as any).data_eigenaar_urlname}/?stallingid=${row.id || ''}`), // String - quoted
        escapeCsvField(row.date_modified ? formatDate(row.date_modified) : ''), // Date string - quoted
      ];

      if(statistics === 'true') {
        // Get stats for this stalling
        const bezettingsdataStat = bezettingsdataMap.get(stallingId);
        const transactiesArchiefCacheStat = transactiesArchiefCacheMap.get(stallingId);
        const stallingsduurCacheStat = stallingsduurCacheMap.get(stallingId);

        // Build CSV row with proper quoting: strings quoted, numbers unquoted
        csvRow.push(...[
          // Bezettingsdata Cache stats
          escapeCsvField(bezettingsdataStat?.eerste_datum ? formatDate(bezettingsdataStat.eerste_datum) : ''),
          escapeCsvField(bezettingsdataStat?.laatste_datum ? formatDate(bezettingsdataStat.laatste_datum) : ''),
          formatNumericField(bezettingsdataStat?.totaal_aantal_cacherecords ? Number(bezettingsdataStat.totaal_aantal_cacherecords) : null),
          formatNumericField(bezettingsdataStat?.aantal_checkins ? Number(bezettingsdataStat.aantal_checkins) : null),
          formatNumericField(bezettingsdataStat?.aantal_checkouts ? Number(bezettingsdataStat.aantal_checkouts) : null),
          // Transacties Archief Cache stats
          escapeCsvField(transactiesArchiefCacheStat?.eerste_datum ? formatDate(transactiesArchiefCacheStat.eerste_datum) : ''),
          escapeCsvField(transactiesArchiefCacheStat?.laatste_datum ? formatDate(transactiesArchiefCacheStat.laatste_datum) : ''),
          formatNumericField(transactiesArchiefCacheStat?.totaal_aantal_cacherecords ? Number(transactiesArchiefCacheStat.totaal_aantal_cacherecords) : null),
          formatNumericField(transactiesArchiefCacheStat?.aantal_checkins ? Number(transactiesArchiefCacheStat.aantal_checkins) : null),
          formatNumericField(transactiesArchiefCacheStat?.aantal_checkouts ? Number(transactiesArchiefCacheStat.aantal_checkouts) : null),
          // Stallingsduur Cache stats
          escapeCsvField(stallingsduurCacheStat?.eerste_datum ? formatDate(stallingsduurCacheStat.eerste_datum) : ''),
          escapeCsvField(stallingsduurCacheStat?.laatste_datum ? formatDate(stallingsduurCacheStat.laatste_datum) : ''),
          formatNumericField(stallingsduurCacheStat?.totaal_aantal_cacherecords ? Number(stallingsduurCacheStat.totaal_aantal_cacherecords) : null),
          formatNumericField(stallingsduurCacheStat?.aantal_checkins ? Number(stallingsduurCacheStat.aantal_checkins) : null),
          formatNumericField(stallingsduurCacheStat?.aantal_checkouts ? Number(stallingsduurCacheStat.aantal_checkouts) : null)
        ]);
      }

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

