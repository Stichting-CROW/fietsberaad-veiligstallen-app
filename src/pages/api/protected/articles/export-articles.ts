import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import PDFDocument from "pdfkit";

type ArticleWithRelations = {
  ID: string;
  SiteID: string | null;
  ParentID: string | null;
  Title: string | null;
  DisplayTitle: string | null;
  Abstract: string | null;
  Article: string | null;
  SortOrder: number | null;
  Status: string | null;
  Navigation: string | null;
  System: string | null;
  EditorCreated: string | null;
  DateCreated: Date | string | null;
  EditorModified: string | null;
  DateModified: Date | string | null;
  ModuleID: string;
};

/**
 * Decode HTML entities and convert to plain text
 */
function decodeHtml(html: string): string {
  return html
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<p[^>]*>/gi, '\n')
    .replace(/<\/p>/gi, '')
    .replace(/<div[^>]*>/gi, '\n')
    .replace(/<\/div>/gi, '')
    .replace(/<h[1-6][^>]*>/gi, '\n')
    .replace(/<\/h[1-6]>/gi, '\n')
    .replace(/<strong[^>]*>/gi, '')
    .replace(/<\/strong>/gi, '')
    .replace(/<b[^>]*>/gi, '')
    .replace(/<\/b>/gi, '')
    .replace(/<em[^>]*>/gi, '')
    .replace(/<\/em>/gi, '')
    .replace(/<i[^>]*>/gi, '')
    .replace(/<\/i>/gi, '')
    .replace(/<ul[^>]*>/gi, '\n')
    .replace(/<\/ul>/gi, '\n')
    .replace(/<ol[^>]*>/gi, '\n')
    .replace(/<\/ol>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<\/li>/gi, '\n')
    .replace(/<a[^>]*href=["']([^"']+)["'][^>]*>(.*?)<\/a>/gi, '$2 ($1)')
    .replace(/<[^>]+>/g, '') // Remove any remaining HTML tags
    .replace(/\n\s*\n\s*\n/g, '\n\n') // Clean up multiple newlines
    .trim();
}

/**
 * Format date for display
 */
function formatDate(date: Date | string | null | undefined): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  return d.toLocaleDateString('nl-NL', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
}

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
  const hasFietsberaadAdmin = userHasRight(
    session.user.securityProfile,
    VSSecurityTopic.fietsberaad_admin
  );
  const hasFietsberaadSuperadmin = userHasRight(
    session.user.securityProfile,
    VSSecurityTopic.fietsberaad_superadmin
  );

  if (!hasFietsberaadAdmin && !hasFietsberaadSuperadmin) {
    res.status(403).json({ error: "Access denied - insufficient permissions" });
    return;
  }

  try {
    // Fetch all articles with content (Abstract OR Article not null and length > 0)
    const articles = await prisma.articles.findMany({
      where: {
        OR: [
          {
            Abstract: {
              not: null,
            },
          },
          {
            Article: {
              not: null,
            },
          },
        ],
      },
      select: {
        ID: true,
        SiteID: true,
        ParentID: true,
        Title: true,
        DisplayTitle: true,
        Abstract: true,
        Article: true,
        SortOrder: true,
        Status: true,
        Navigation: true,
        System: true,
        EditorCreated: true,
        DateCreated: true,
        EditorModified: true,
        DateModified: true,
        ModuleID: true,
      },
      orderBy: [
        {
          SiteID: 'asc',
        },
        {
          SortOrder: 'asc',
        },
        {
          Title: 'asc',
        },
      ],
    }) as ArticleWithRelations[];

    // Filter articles that actually have content (non-empty Abstract or Article)
    // Also filter out articles without SiteID (can't determine company)
    const articlesWithContent = articles.filter(
      (article) =>
        article.SiteID && // Must have SiteID to determine company
        ((article.Abstract && article.Abstract.trim().length > 0) ||
         (article.Article && article.Article.trim().length > 0))
    );

    if (articlesWithContent.length === 0) {
      res.status(404).json({ error: "No articles with content found" });
      return;
    }

    // Get all unique SiteIDs
    const siteIDs = [
      ...new Set(
        articlesWithContent
          .map((a) => a.SiteID)
          .filter((id): id is string => id !== null)
      ),
    ];

    // Fetch company names for all SiteIDs
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

    const companyNameMap = new Map<string, string | null>();
    for (const contact of contacts) {
      companyNameMap.set(contact.ID, contact.CompanyName);
    }
    
    // For SiteIDs without a contact record, use the SiteID as the name
    for (const siteID of siteIDs) {
      if (!companyNameMap.has(siteID)) {
        companyNameMap.set(siteID, siteID);
      }
    }

    // Get all unique ParentIDs
    const parentIDs = [
      ...new Set(
        articlesWithContent
          .map((a) => a.ParentID)
          .filter((id): id is string => id !== null)
      ),
    ];

    // Fetch parent article titles
    const parentArticles = await prisma.articles.findMany({
      where: {
        ID: {
          in: parentIDs,
        },
      },
      select: {
        ID: true,
        Title: true,
        DisplayTitle: true,
      },
    });

    const parentTitleMap = new Map<string, string>();
    for (const parent of parentArticles) {
      const title = parent.DisplayTitle || parent.Title || '';
      if (title) {
        parentTitleMap.set(parent.ID, title);
      }
    }

    // Group articles by SiteID
    const articlesByCompany = new Map<string, ArticleWithRelations[]>();
    for (const article of articlesWithContent) {
      const siteID = article.SiteID || 'unknown';
      if (!articlesByCompany.has(siteID)) {
        articlesByCompany.set(siteID, []);
      }
      articlesByCompany.get(siteID)!.push(article);
    }

    // Sort companies by name
    const sortedSiteIDs = Array.from(articlesByCompany.keys()).sort((a, b) => {
      const nameA = companyNameMap.get(a) ?? a;
      const nameB = companyNameMap.get(b) ?? b;
      return String(nameA).localeCompare(String(nameB), 'nl-NL');
    });

    // Create PDF document
    const doc = new PDFDocument({
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      size: 'A4',
    });

    // Set response headers for PDF download
    const filename = `artikelen_export_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    // Pipe PDF to response
    doc.pipe(res);

    // Title page
    doc.fontSize(24).font('Helvetica-Bold').text('Export van alle artikelen', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).font('Helvetica').text(`Gegenereerd op: ${new Date().toLocaleString('nl-NL')}`, { align: 'center' });
    doc.addPage();

    // Table of Contents
    doc.fontSize(18).font('Helvetica-Bold').text('Inhoudsopgave', { align: 'left' });
    doc.moveDown(0.5);

    // Add TOC entries
    doc.fontSize(11).font('Helvetica');
    
    for (let idx = 0; idx < sortedSiteIDs.length; idx++) {
      const siteID = sortedSiteIDs[idx];
      if (!siteID) continue;
      
      const companyArticles = articlesByCompany.get(siteID) || [];
      const companyName = companyNameMap.get(siteID) || siteID;
      const articleCount = companyArticles.length;
      const tocText = `${companyName} (${articleCount} ${articleCount === 1 ? 'pagina' : 'pagina\'s'})`;
      
      doc.text(tocText, { indent: 20 });
      doc.moveDown(0.3);
      
      // Check if we need a new page for TOC
      if (doc.y > 750) {
        doc.addPage();
        doc.fontSize(18).font('Helvetica-Bold').text('Inhoudsopgave (vervolg)', { align: 'left' });
        doc.moveDown(0.5);
        doc.fontSize(11).font('Helvetica');
      }
    }

    // Generate content for each company
    for (let i = 0; i < sortedSiteIDs.length; i++) {
      const siteID = sortedSiteIDs[i];
      if (!siteID) continue;
      
      const companyArticles = articlesByCompany.get(siteID) || [];
      const companyName = companyNameMap.get(siteID) || siteID;

      const totalCount = companyArticles.length;
      let itemIndex = 0;

      // Generate content for each article
      for (let j = 0; j < companyArticles.length; j++) {
        const article = companyArticles[j];
        if (!article) continue;
        
        // Each article gets its own page
        doc.addPage();
        
        // Add company header and bookmark on first item of company
        if (itemIndex === 0) {
          const h1Text = `${companyName} (${totalCount} ${totalCount === 1 ? 'pagina' : 'pagina\'s'})`;
          
          // Add bookmark to PDF outline
          doc.outline.addItem(h1Text, { expanded: false });
          
          doc.fontSize(20).font('Helvetica-Bold').text(h1Text, { align: 'left' });
          doc.moveDown();
        }
        
        itemIndex++;
        
        const title = article.DisplayTitle || article.Title || 'Geen titel';
        
        // H2 for article title
        doc.fontSize(16).font('Helvetica-Bold').text(title, { align: 'left' });
        doc.moveDown(0.5);

        // Table with properties
        doc.fontSize(10).font('Helvetica');
        
        const properties: Array<[string, string]> = [];
        
        if (article.ID) {
          properties.push(['ID', article.ID]);
        }
        if (article.DisplayTitle) {
          properties.push(['DisplayTitle', article.DisplayTitle]);
        }
        if (article.SortOrder !== null) {
          properties.push(['SortOrder', String(article.SortOrder)]);
        }
        if (article.Status) {
          properties.push(['Status', article.Status]);
        }
        if (article.Navigation) {
          properties.push(['Navigation', article.Navigation]);
        }
        if (article.System) {
          properties.push(['System', article.System]);
        }
        if (article.EditorCreated) {
          properties.push(['EditorCreated', article.EditorCreated]);
        }
        if (article.DateCreated) {
          properties.push(['DateCreated', formatDate(article.DateCreated)]);
        }
        if (article.EditorModified) {
          properties.push(['EditorModified', article.EditorModified]);
        }
        if (article.DateModified) {
          properties.push(['DateModified', formatDate(article.DateModified)]);
        }
        if (article.ModuleID) {
          properties.push(['ModuleID', article.ModuleID]);
        }
        if (article.ParentID) {
          const parentTitle = parentTitleMap.get(article.ParentID) || article.ParentID;
          properties.push(['Parent Article', parentTitle]);
        }

        // Calculate table height and check if we need a new page
        const col1X = 50;
        const col2X = 250;
        const rowHeight = 15;
        const tableWidth = 500;
        const tableHeight = (properties.length + 1) * rowHeight; // +1 for header
        const pageBottom = 750; // Approximate bottom margin
        
        // If table won't fit on current page, start on new page
        if (doc.y + tableHeight > pageBottom) {
          doc.addPage();
        }

        // Draw table
        let tableY = doc.y;

        // Table header
        doc.font('Helvetica-Bold').fontSize(10);
        doc.rect(col1X, tableY, tableWidth, rowHeight).stroke();
        doc.text('Eigenschap', col1X + 5, tableY + 3);
        doc.text('Waarde', col2X + 5, tableY + 3);
        tableY += rowHeight;

        // Table rows
        doc.font('Helvetica').fontSize(9);
        for (const [key, value] of properties) {
          // Check if we need a new page for this row
          if (tableY + rowHeight > pageBottom) {
            doc.addPage();
            tableY = doc.page.margins.top;
            // Redraw header on new page
            doc.font('Helvetica-Bold').fontSize(10);
            doc.rect(col1X, tableY, tableWidth, rowHeight).stroke();
            doc.text('Eigenschap', col1X + 5, tableY + 3);
            doc.text('Waarde', col2X + 5, tableY + 3);
            tableY += rowHeight;
            doc.font('Helvetica').fontSize(9);
          }
          
          doc.rect(col1X, tableY, tableWidth, rowHeight).stroke();
          doc.text(key, col1X + 5, tableY + 3, { width: col2X - col1X - 10 });
          doc.text(String(value || ''), col2X + 5, tableY + 3, { width: tableWidth - (col2X - col1X) - 10 });
          tableY += rowHeight;
        }

        doc.y = tableY + 10;

        // Abstract paragraph (if set)
        if (article.Abstract && article.Abstract.trim().length > 0) {
          const decodedAbstract = decodeHtml(article.Abstract);
          doc.fontSize(11).font('Helvetica-Bold').text('Abstract:', { align: 'left' });
          doc.moveDown(0.3);
          doc.fontSize(10).font('Helvetica').text(decodedAbstract, { align: 'left' });
          doc.moveDown();
        }

        // Article paragraph (if set)
        if (article.Article && article.Article.trim().length > 0) {
          const decodedArticle = decodeHtml(article.Article);
          doc.fontSize(11).font('Helvetica-Bold').text('Article:', { align: 'left' });
          doc.moveDown(0.3);
          doc.fontSize(10).font('Helvetica').text(decodedArticle, { align: 'left' });
          doc.moveDown();
        }
      }
    }

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error("Error exporting articles:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "An error occurred while exporting articles" });
    }
  }
}

