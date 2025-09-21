import { prisma } from "~/server/db";
import { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from '~/pages/api/auth/[...nextauth]';

const generateFaqReport = async () => {
  const faqs = await prisma.faq.findMany();

  if (faqs.length === 0) {
    return '';
  }

  // Get headers from the first record
  const headers = Object.keys(faqs[0]!);
  
  // Create CSV with proper escaping
  const csvRows = [
    // Header row
    headers.map(header => `"${header}"`).join(','),
    // Data rows
    ...faqs.map(faq => 
      headers.map(header => {
        const value = faq[header as keyof typeof faq];
        // Convert to string and escape quotes
        const stringValue = String(value || '').replace(/"/g, '""');
        // Wrap in quotes to handle commas, newlines, etc.
        return `"${stringValue}"`;
      }).join(',')
    )
  ];
  
  return csvRows.join('\n');
}

const generatePaginaReport = async () => {
  console.log('Starting generatePaginaReport...');
  try {
    // Get all articles
    const pages = await prisma.articles.findMany();  
    console.log('Found pages:', pages.length);
    
    if (pages.length === 0) {
      return '';
    }

    // Get all contacts to map SiteID to CompanyName
    const contacts = await prisma.contacts.findMany({
      select: {
        ID: true,
        CompanyName: true
      }
    });
    
    // Create a map for quick lookup
    const contactMap = new Map(contacts.map(contact => [contact.ID, contact.CompanyName]));
    console.log('Contact map size:', contactMap.size);
    console.log('Sample contacts:', contacts.slice(0, 3));

    // Sort pages by Organization (CompanyName) first, then by Title
    const sortedPages = pages.sort((a, b) => {
      const aOrg = a.SiteID ? contactMap.get(a.SiteID) || '' : '';
      const bOrg = b.SiteID ? contactMap.get(b.SiteID) || '' : '';
      
      // First sort by Organization
      if (aOrg !== bOrg) {
        return aOrg.localeCompare(bOrg);
      }
      
      // Then sort by Title
      const aTitle = a.Title || '';
      const bTitle = b.Title || '';
      return aTitle.localeCompare(bTitle);
    });

    // Define the columns we want to include based on VSArticle type
    const vsArticleColumns = [
      'ID', 'Title', 'DisplayTitle', 'Abstract', 'Article', 'SortOrder', 
      'Status', 'Navigation', 'System', 'EditorCreated', 'DateCreated', 
      'EditorModified', 'DateModified', 'ModuleID'
    ];
    
    // Add Organization column (replacing SiteID with CompanyName)
    const headers = [...vsArticleColumns];
    headers.splice(1, 0, 'Organization'); // Insert after ID
    console.log('Headers:', headers);
    
    // Create CSV with proper escaping
    const csvRows = [
      // Header row
      headers.map(header => `"${header}"`).join(','),
      // Data rows
      ...sortedPages.map(page => 
        headers.map(header => {
          let value;
          if (header === 'Organization') {
            // Get CompanyName from the contact map using SiteID
            value = page.SiteID ? contactMap.get(page.SiteID) || '' : '';
            if (page.SiteID && !value) {
              console.log(`No Organization found for SiteID: ${page.SiteID}`);
            }
          } else {
            // Get value from the page object
            value = page[header as keyof typeof page];
          }
          // Convert to string and escape quotes
          const stringValue = String(value || '').replace(/"/g, '""');
          // Wrap in quotes to handle commas, newlines, etc.
          return `"${stringValue}"`;
        }).join(',')
      )
    ];
    
    const csv = csvRows.join('\n');
    console.log('Generated CSV length:', csv.length);
    console.log('First few rows of CSV:');
    console.log(csvRows.slice(0, 3).join('\n'));
    return csv;
  } catch (error) {
    console.error('Error in generatePaginaReport:', error);
    throw error;
  }
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  console.log('API handler called with method:', req.method);
  
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    console.log('Checking authentication...');
    // Check authentication and authorization
    const session = await getServerSession(req, res, authOptions);
    
    if (!session) {
      console.log('No session found');
      return res.status(401).json({ success: false, error: 'Unauthorized' });
    }

    console.log('Session found for user:', session.user?.email);

    // TODO: Add superadmin check for fietsberaad
    // This is a stub that will be filled in later

    const { type } = req.query;
    console.log('Report type requested:', type);

    if (!type || (type !== 'paginas' && type !== 'faq')) {
      return res.status(400).json({ 
        success: false, 
        error: 'Invalid report type. Must be "paginas" or "faq"' 
      });
    }

    console.log('Generating report...');
    // For now, return a placeholder response based on the type
    const data = type === 'paginas' ? await generatePaginaReport() : await generateFaqReport();
    
    const result = {
      success: true,
      message: `${type === 'paginas' ? 'Pagina' : 'FAQ'} report generated successfully`,
      data: data
    };

    console.log('Sending response...');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    return res.status(200).json(result);
  } catch (error) {
    console.error('Error in articles report:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}
