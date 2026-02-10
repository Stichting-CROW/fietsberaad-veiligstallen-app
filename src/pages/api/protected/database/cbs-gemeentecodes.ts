import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '~/pages/api/auth/[...nextauth]';
import { prisma } from '~/server/db';
import { VSSecurityTopic } from '~/types/securityprofile';
import { userHasRight } from '~/types/utils';
import * as XLSX from 'xlsx';
import * as fs from 'fs';
import * as path from 'path';

export type CBSGemeentecodesResponse = {
  success: boolean;
  message: string;
  data?: {
    contacts: Array<{
      companyname: string;
      veiligstallen_gemeentecode: string;
    }>;
    cbs_gemeentecodes: Array<{
      name: string;
      history: Array<{
        cbscode: string;
        firstyear: string;
        lastyear: string;
      }>;
    }>;
  };
  error?: string;
};

// Hardcoded list of CBS Excel file URLs (one per year since 2010)
const CBS_EXCEL_URLS = [
  { year: 2011, url: 'https://www.cbs.nl/-/media/imported/onze-diensten/methoden/classificaties/documents/2010/47/2011-gemeenten-alfabetisch.xls' },
  { year: 2012, url: 'https://www.cbs.nl/-/media/imported/onze-diensten/methoden/classificaties/documents/2010/47/2012-gemeenten-alfabetisch.xls' },
  { year: 2013, url: 'https://www.cbs.nl/-/media/imported/onze-diensten/methoden/classificaties/documents/2012/46/2013-gemeenten-alfabetisch.xls' },
  { year: 2014, url: 'https://www.cbs.nl/-/media/imported/onze-diensten/methoden/classificaties/documents/2013/49/2014-gemeenten-alfabetisch.xls' },
  { year: 2015, url: 'https://www.cbs.nl/-/media/imported/onze-diensten/methoden/classificaties/documents/2014/43/gemeenten-alfabetisch-2015.xls' },
  { year: 2016, url: 'https://www.cbs.nl/-/media/imported/onze-diensten/methoden/classificaties/documents/2015/39/gemeenten-alfabetisch-2016.xls' },
  { year: 2017, url: 'https://www.cbs.nl/-/media/_excel/2016/38/gemeenten-alfabetisch-2017.xls' },
  { year: 2018, url: 'https://www.cbs.nl/-/media/_excel/2017/36/gemeenten-alfabetisch-2018.xls' },
  { year: 2019, url: 'https://www.cbs.nl/-/media/cbs/onze-diensten/methoden/classificaties/overig/gemeenten-alfabetisch-2019.xls' },
  { year: 2020, url: 'https://www.cbs.nl/-/media/_excel/2020/03/gemeenten-alfabetisch-2020.xlsx' },
  { year: 2021, url: 'https://www.cbs.nl/-/media/_excel/2020/47/gemeenten-alfabetisch-2021.xlsx' },
  { year: 2022, url: 'https://www.cbs.nl/-/media/cbs/onze-diensten/methoden/classificaties/overig/gemeenten-alfabetisch-2022.xlsx' },
  { year: 2023, url: 'https://www.cbs.nl/-/media/cbs/onze-diensten/methoden/classificaties/overig/gemeenten-alfabetisch-2023.xlsx' },
  { year: 2024, url: 'https://www.cbs.nl/-/media/cbs/onze-diensten/methoden/classificaties/overig/gemeenten-alfabetisch-2024.xlsx' },
  { year: 2025, url: 'https://www.cbs.nl/-/media/cbs/onze-diensten/methoden/classificaties/overig/gemeenten-alfabetisch-2025.xlsx' },
  { year: 2026, url: 'https://www.cbs.nl/-/media/cbs/onze-diensten/methoden/classificaties/overig/gemeenten-alfabetisch-2026.xlsx' },
];

interface GemeenteData {
  name: string;
  code: string;
  year: number;
}

// Download Excel file from URL
async function downloadExcelFile(url: string, filePath: string, year: number): Promise<void> {
  try {
    const response = await fetch(url);
    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Bestand niet gevonden (404)`);
      }
      throw new Error(`Download mislukt: ${response.status} ${response.statusText}`);
    }
    const buffer = await response.arrayBuffer();
    if (buffer.byteLength === 0) {
      throw new Error(`Leeg bestand ontvangen`);
    }
    fs.writeFileSync(filePath, Buffer.from(buffer));
  } catch (error) {
    if (error instanceof Error && error.message.includes('fetch')) {
      throw new Error(`Netwerkfout bij downloaden`);
    }
    throw error;
  }
}

// Parse Excel file and extract gemeente data
function parseExcelFile(filePath: string, year: number): GemeenteData[] {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) {
      throw new Error(`Bestand niet gevonden`);
    }
    
    // Check if file is readable
    try {
      fs.accessSync(filePath, fs.constants.R_OK);
    } catch {
      throw new Error(`Bestand niet leesbaar`);
    }
    
    const workbook = XLSX.readFile(filePath);
    
    if (!workbook.SheetNames || workbook.SheetNames.length === 0) {
      throw new Error(`Geen werkbladen gevonden`);
    }
    
    // Try to find the "Gemeenten_alfabetisch" sheet
    console.log(`[${year}] Available sheets:`, workbook.SheetNames);
    let sheetName: string = 'Gemeenten_alfabetisch';
    if (!workbook.SheetNames.includes(sheetName)) {
      // Try alternative names
      const alternatives = workbook.SheetNames.filter(name => 
        name.toLowerCase().includes('gemeenten') || 
        name.toLowerCase().includes('alfabet')
      );
      if (alternatives.length > 0) {
        sheetName = alternatives[0]!;
        console.log(`[${year}] Using alternative sheet name: "${sheetName}"`);
      } else {
        // Use first sheet if not found
        sheetName = workbook.SheetNames[0]!;
        console.log(`[${year}] Using first available sheet: "${sheetName}"`);
      }
    } else {
      console.log(`[${year}] Using sheet: "${sheetName}"`);
    }
    
    const worksheet = workbook.Sheets[sheetName];
    if (!worksheet) {
      throw new Error(`Werkblad '${sheetName}' niet gevonden`);
    }
    
    const data = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
    
    if (!data || data.length === 0) {
      throw new Error(`Geen data gevonden in werkblad`);
    }
    
    const gemeenten: GemeenteData[] = [];
    
    // Find header row (usually first row)
    let headerRowIndex = 0;
    let nameColumnIndex = -1;
    let codeColumnIndex = -1;
    
    // Determine expected column names based on year
    // Gemeentecode: "Gemcode" (2011-2014), "Gemeentecode" (2015-)
    // Name: "Gemcodel" (2011-2014 - note: lowercase 'l', not number '1'), "Gemeentenaam" (2015-)
    const expectedCodeNames = year >= 2015 
      ? ['gemeentecode']
      : ['gemcode'];
    const expectedNameNames = year >= 2011 && year <= 2014
      ? ['gemcodel', 'gemcode1', 'gemeentenaam', 'naam', 'gemeente'] // "Gemcodel" is the actual column name (lowercase 'l') for 2011-2014
      : year >= 2015
      ? ['gemeentenaam']
      : ['gemeentenaam', 'naam', 'gemeente']; // Fallback for other years
    
    // Look for header row with expected column names
    for (let i = 0; i < Math.min(5, data.length); i++) {
      const row = data[i];
      if (!Array.isArray(row)) continue;
      
      // Log all column names in this row for debugging
      if (i < 3) {
        console.log(`[${year}] Row ${i} columns:`, row.map((cell, idx) => `[${idx}] "${String(cell || '').trim()}"`).join(', '));
      }
      
      for (let j = 0; j < row.length; j++) {
        const cell = String(row[j] || '').toLowerCase().trim();
        
        // Check for code column (case-insensitive, exact match)
        if (codeColumnIndex < 0 && expectedCodeNames.some(name => cell === name)) {
          codeColumnIndex = j;
          console.log(`[${year}] Found code column at index ${j}: "${row[j]}"`);
        }
        
        // Check for name column (case-insensitive, exact match)
        if (nameColumnIndex < 0 && expectedNameNames.some(name => cell === name)) {
          nameColumnIndex = j;
          console.log(`[${year}] Found name column at index ${j}: "${row[j]}"`);
        }
      }
      
      if (nameColumnIndex >= 0 && codeColumnIndex >= 0) {
        headerRowIndex = i;
        break;
      }
    }
    
    // Log header information for debugging
    if (headerRowIndex < data.length) {
      const headerRow = data[headerRowIndex];
      console.log(`[${year}] Header row (index ${headerRowIndex}):`, headerRow);
      console.log(`[${year}] Expected - Code: ${expectedCodeNames.join('/')}, Name: ${expectedNameNames.join('/')}`);
      console.log(`[${year}] Detected columns - Name column: ${nameColumnIndex}, Code column: ${codeColumnIndex}`);
      if (Array.isArray(headerRow)) {
        console.log(`[${year}] Column names:`, headerRow.map((cell, idx) => `[${idx}] "${String(cell || '').trim()}"`).join(', '));
      }
    }
    
    // If required columns are not found, skip this year's data
    if (nameColumnIndex < 0 || codeColumnIndex < 0) {
      const missingColumns = [];
      if (nameColumnIndex < 0) {
        missingColumns.push(`Naam kolom (verwacht: ${expectedNameNames.join(' of ')})`);
      }
      if (codeColumnIndex < 0) {
        missingColumns.push(`Code kolom (verwacht: ${expectedCodeNames.join(' of ')})`);
      }
      const errorMsg = `Kolommen niet gevonden: ${missingColumns.join(', ')}. Data voor ${year} wordt overgeslagen.`;
      console.warn(`[${year}] ${errorMsg}`);
      throw new Error(errorMsg);
    }
    
    // Parse data rows with validation
    let firstRecordLogged = false;
    for (let i = headerRowIndex + 1; i < data.length; i++) {
      const row = data[i];
      if (!Array.isArray(row) || row.length === 0) continue;
      
      let name = String(row[nameColumnIndex] || '').trim();
      let code = String(row[codeColumnIndex] || '').trim();
      
      // Log first record for debugging
      if (!firstRecordLogged && name && code) {
        console.log(`[${year}] First record (row ${i}):`);
        console.log(`[${year}]   Full row:`, row);
        console.log(`[${year}]   Name (col ${nameColumnIndex}): "${name}"`);
        console.log(`[${year}]   Code (col ${codeColumnIndex}): "${code}"`);
        firstRecordLogged = true;
      }
      
      // Validation: if name looks like a code (only digits), swap them
      if (name && code) {
        // If name is numeric and code is not, or if name is shorter and numeric, likely swapped
        if (/^\d+$/.test(name) && !/^\d+$/.test(code)) {
          // Swap them
          [name, code] = [code, name];
        }
        // If both are numeric, check which one is more likely a name
        // Names are usually longer or have specific patterns
        else if (/^\d+$/.test(name) && /^\d+$/.test(code)) {
          // If name column value is shorter and looks like a code, check if code column has more characters
          // This is tricky - we'll keep original assignment but log a warning
          console.warn(`[${year}] Row ${i}: Both name and code appear numeric. Name: "${name}", Code: "${code}"`);
        }
        
        // Final validation: name should not be just a 4-digit code
        // Gemeente names typically have letters or are longer
        if (/^\d{4}$/.test(name) && code) {
          // This looks like a code in the name field - skip this row or use code as name
          console.warn(`[${year}] Row ${i}: Skipping row with code in name field: "${name}"`);
          continue;
        }
        
        // Only add if we have valid name (contains letters or is longer than 4 chars) and code
        if (name && code && (name.length > 4 || /[a-zA-Z]/.test(name))) {
          gemeenten.push({ name, code, year });
        }
      }
    }
    
    if (gemeenten.length === 0) {
      throw new Error(`Geen gemeenten gevonden in bestand`);
    }
    
    return gemeenten;
  } catch (error) {
    if (error instanceof Error) {
      // Re-throw with year context
      throw new Error(`${error.message}`);
    }
    throw new Error(`Onbekende fout bij parseren`);
  }
}

// Build historical structure from gemeente data
function buildHistoricalStructure(
  allGemeenten: GemeenteData[]
): Array<{
  name: string;
  history: Array<{
    cbscode: string;
    firstyear: string;
    lastyear: string;
  }>;
}> {
  // Group by gemeente name
  const gemeenteMap = new Map<string, Map<string, { firstYear: number; lastYear: number }>>();
  
  for (const gemeente of allGemeenten) {
    if (!gemeenteMap.has(gemeente.name)) {
      gemeenteMap.set(gemeente.name, new Map());
    }
    
    const codeMap = gemeenteMap.get(gemeente.name)!;
    
    if (!codeMap.has(gemeente.code)) {
      codeMap.set(gemeente.code, {
        firstYear: gemeente.year,
        lastYear: gemeente.year,
      });
    } else {
      const existing = codeMap.get(gemeente.code)!;
      existing.firstYear = Math.min(existing.firstYear, gemeente.year);
      existing.lastYear = Math.max(existing.lastYear, gemeente.year);
    }
  }
  
  // Convert to output structure
  const result: Array<{
    name: string;
    history: Array<{
      cbscode: string;
      firstyear: string;
      lastyear: string;
    }>;
  }> = [];
  
  for (const [name, codeMap] of gemeenteMap.entries()) {
    const history: Array<{
      cbscode: string;
      firstyear: string;
      lastyear: string;
    }> = [];
    
    for (const [code, years] of codeMap.entries()) {
      history.push({
        cbscode: code,
        firstyear: years.firstYear.toString(),
        lastyear: years.lastYear.toString(),
      });
    }
    
    // Sort history descending by lastyear
    history.sort((a, b) => parseInt(b.lastyear) - parseInt(a.lastyear));
    
    result.push({ name, history });
  }
  
  // Sort by name
  result.sort((a, b) => a.name.localeCompare(b.name));
  
  return result;
}

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<CBSGemeentecodesResponse>
) {
  if (req.method !== 'POST') {
    res.status(405).json({ 
      success: false,
      message: 'Methode niet toegestaan',
      error: 'Method not allowed' 
    });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ 
      success: false,
      message: 'Niet ingelogd',
      error: 'Niet ingelogd - geen sessie gevonden' 
    });
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
    res.status(403).json({ 
      success: false,
      message: 'Geen toegang',
      error: 'Access denied - insufficient permissions' 
    });
    return;
  }

  try {
    // Create temporary directory for downloaded files
    const tmpDir = path.join(process.cwd(), '.tmp', 'cbs-gemeentecodes');
    console.log(`Creating temporary directory: ${tmpDir}`);
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
      console.log(`Temporary directory created: ${tmpDir}`);
    } else {
      console.log(`Temporary directory already exists: ${tmpDir}`);
    }

    // Download and parse all Excel files
    const allGemeenten: GemeenteData[] = [];
    const downloadErrors: string[] = [];

    for (const { year, url } of CBS_EXCEL_URLS) {
      try {
        const filePath = path.join(tmpDir, `gemeenten-${year}.xlsx`);
        
        // Check if file already exists
        if (fs.existsSync(filePath)) {
          const stats = fs.statSync(filePath);
          console.log(`[${year}] File already exists (${stats.size} bytes), skipping download`);
        } else {
          console.log(`[${year}] Downloading CBS Excel file from ${url}...`);
          console.log(`[${year}] Saving to: ${filePath}`);
          
          await downloadExcelFile(url, filePath, year);
          
          // Verify file was downloaded
          if (!fs.existsSync(filePath)) {
            throw new Error(`Bestand niet aangemaakt`);
          }
          const stats = fs.statSync(filePath);
          console.log(`[${year}] File downloaded successfully (${stats.size} bytes)`);
        }
        
        console.log(`[${year}] Parsing Excel file...`);
        const gemeenten = parseExcelFile(filePath, year);
        allGemeenten.push(...gemeenten);
        
        console.log(`[${year}] Processed ${gemeenten.length} gemeenten`);
      } catch (error) {
        const errorMsg = error instanceof Error 
          ? `${year}: ${error.message}`
          : `${year}: Onbekende fout`;
        console.error(`[${year}] ${errorMsg}`);
        downloadErrors.push(errorMsg);
        // Continue with other years even if one fails
      }
    }

    // Keep files permanently - they won't change in the future
    const files = fs.readdirSync(tmpDir);
    console.log(`Excel files stored at: ${tmpDir}`);
    console.log(`Total files: ${files.length}`);

    if (allGemeenten.length === 0) {
      return res.status(500).json({
        success: false,
        message: 'Geen gemeenten data kon worden geëxtraheerd uit Excel bestanden',
        error: downloadErrors.length > 0 
          ? `Fouten bij ${downloadErrors.length} jaar(en): ${downloadErrors.slice(0, 3).join('; ')}${downloadErrors.length > 3 ? '...' : ''}`
          : 'Geen data gevonden',
      });
    }

    // Build historical structure
    console.log('Building historical structure...');
    const cbsGemeentecodes = buildHistoricalStructure(allGemeenten);

    // Query contacts from database
    const contacts = await prisma.contacts.findMany({
      select: {
        ID: true,
        CompanyName: true,
        Gemeentecode: true,
        ItemType: true,
      },
      where: {
        CompanyName: {
          not: null,
        },
      },
      orderBy: {
        CompanyName: 'asc',
      },
    });

    // Get counts of fietsenstallingen for each contact
    // Count from fietsenstallingen table where SiteID matches contact ID
    // This matches the logic in /api/protected/fietsenstallingen/index.ts
    const contactFietsenstallingenCounts = await Promise.all(
      contacts.map(async (contact) => {
        const count = await prisma.fietsenstallingen.count({
          where: {
            SiteID: contact.ID,
            Title: { // Exclude Systeemstalling (matching API logic)
              not: 'Systeemstalling'
            },
            StallingsID: { not: null },
            // Exclude stallingen from archived data owners (Status = "0")
            contacts_fietsenstallingen_SiteIDTocontacts: {
              Status: { not: "0" }
            },
          },
        });
        return { contactId: contact.ID, count };
      })
    );

    // Create a map for quick lookup
    const countMap = new Map(
      contactFietsenstallingenCounts.map(item => [item.contactId, item.count])
    );

    // Map contacts to response structure
    const contactsData = contacts.map((contact) => {
      // Pad gemeentecode with leading zeros to make it 4 digits
      const gemeentecode = contact.Gemeentecode?.toString() || '';
      const paddedGemeentecode = gemeentecode ? gemeentecode.padStart(4, '0') : '';
      
      return {
        companyname: contact.CompanyName || '',
        veiligstallen_gemeentecode: paddedGemeentecode,
        itemtype: contact.ItemType || null,
        fietsenstallingen_count: countMap.get(contact.ID) || 0,
      };
    });

    const message = downloadErrors.length > 0
      ? `CBS gemeentecodes processed with ${downloadErrors.length} error(s). Processed ${cbsGemeentecodes.length} gemeenten.`
      : `CBS gemeentecodes processed successfully. Processed ${cbsGemeentecodes.length} gemeenten.`;

    return res.status(200).json({
      success: true,
      message,
      data: {
        contacts: contactsData,
        cbs_gemeentecodes: cbsGemeentecodes,
      },
      ...(downloadErrors.length > 0 && { warnings: downloadErrors }),
    });
  } catch (error) {
    console.error('Error processing CBS gemeentecodes:', error);
    return res.status(500).json({
      success: false,
      message: 'Fout bij verwerken van CBS gemeentecodes',
      error: error instanceof Error ? error.message : 'Onbekende fout',
    });
  }
}
