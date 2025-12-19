import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import PDFDocument from "pdfkit";

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
    // Fetch all FAQs - matching the structure used in the FAQ page
    // Sections: FAQs with Title !== null (these are the parent sections)
    // Items: FAQs with Title === null (these are child FAQs)
    // Only fetch active FAQs (Status = '1' or true)
    const allFaqs = await prisma.faq.findMany({
      where: {
        Status: '1', // Only active FAQs (matching FAQ page logic)
      },
      select: {
        ID: true,
        ParentID: true,
        Title: true,
        Question: true,
        Answer: true,
        SortOrder: true,
        Status: true,
        EditorCreated: true,
        DateCreated: true,
        EditorModified: true,
        DateModified: true,
        ModuleID: true,
      },
      orderBy: [
        {
          SortOrder: 'asc',
        },
      ],
    });

    // Sections: FAQs with Title !== null AND Title !== '' (matching FAQ page logic)
    // Sections don't need Question/Answer content - they're just headers
    const sections = allFaqs.filter(
      (faq) => faq.Title !== null && faq.Title !== undefined && faq.Title.trim().length > 0
    );
    
    // Items: FAQs with Title === null OR Title === '' (matching FAQ page logic)
    // Items need Question or Answer content
    const items = allFaqs.filter(
      (faq) =>
        (faq.Title === null || faq.Title === undefined || faq.Title.trim().length === 0) &&
        ((faq.Question && faq.Question.trim().length > 0) ||
         (faq.Answer && faq.Answer.trim().length > 0))
    );

    console.log(`[FAQ Export] Total FAQs: ${allFaqs.length}, Sections: ${sections.length}, Items: ${items.length}`);

    if (sections.length === 0) {
      res.status(404).json({ 
        error: "No FAQ sections found",
        debug: {
          totalFaqs: allFaqs.length,
          sectionsFound: sections.length,
          itemsFound: items.length,
          sampleFaqs: allFaqs.slice(0, 5).map(f => ({
            id: f.ID,
            title: f.Title,
            hasQuestion: !!f.Question,
            hasAnswer: !!f.Answer,
            parentId: f.ParentID
          }))
        }
      });
      return;
    }

    // Group items by ParentID (matching FAQ page structure)
    const itemsBySection = new Map<string, typeof items>();
    for (const item of items) {
      if (item.ParentID) {
        if (!itemsBySection.has(item.ParentID)) {
          itemsBySection.set(item.ParentID, []);
        }
        itemsBySection.get(item.ParentID)!.push(item);
      }
    }

    // Sort sections by SortOrder
    const sortedSections = sections.sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0));

    // Filter to only sections that have items (matching FAQ page: "Don't show empty sections")
    const sectionsWithItems = sortedSections.filter(section => {
      const sectionItems = itemsBySection.get(section.ID) || [];
      return sectionItems.length > 0;
    });

    if (sectionsWithItems.length === 0) {
      res.status(404).json({ error: "No FAQ sections with items found" });
      return;
    }

    // Create PDF document
    const doc = new PDFDocument({
      margins: { top: 50, bottom: 50, left: 50, right: 50 },
      size: 'A4',
    });

    // Set response headers for PDF download
    const filename = `faqs_export_${new Date().toISOString().split('T')[0]}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    // Pipe PDF to response
    doc.pipe(res);

    // Title page
    doc.fontSize(24).font('Helvetica-Bold').text('Export van alle FAQ\'s', { align: 'center' });
    doc.moveDown();
    doc.fontSize(12).font('Helvetica').text(`Gegenereerd op: ${new Date().toLocaleString('nl-NL')}`, { align: 'center' });
    doc.addPage();

    // Table of Contents
    doc.fontSize(18).font('Helvetica-Bold').text('Inhoudsopgave', { align: 'left' });
    doc.moveDown(0.5);

    // Add TOC entries for sections (matching FAQ page structure)
    doc.fontSize(11).font('Helvetica');
    
    for (let idx = 0; idx < sectionsWithItems.length; idx++) {
      const section = sectionsWithItems[idx];
      const sectionItems = itemsBySection.get(section.ID) || [];
      const itemCount = sectionItems.length;
      const sectionTitle = section.Title || 'Geen titel';
      const tocText = `${sectionTitle} (${itemCount} ${itemCount === 1 ? 'FAQ' : 'FAQ\'s'})`;
      
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

    // Generate content for each section (matching FAQ page structure)
    for (let i = 0; i < sectionsWithItems.length; i++) {
      const section = sectionsWithItems[i];
      const sectionItems = itemsBySection.get(section.ID) || [];
      
      // Sort items by SortOrder (matching FAQ page)
      const sortedItems = sectionItems.sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0));
      
      const sectionTitle = section.Title || 'Geen titel';
      const totalCount = sortedItems.length;
      let itemIndex = 0;

      // Generate content for each item (matching FAQ page: each item gets its own page)
      for (const faq of sortedItems) {
        // Each FAQ gets its own page
        doc.addPage();
        
        // Add section header (H1) and bookmark on first FAQ of section
        if (itemIndex === 0) {
          const h1Text = `${sectionTitle} (${totalCount} ${totalCount === 1 ? 'FAQ' : 'FAQ\'s'})`;
          
          // Add bookmark to PDF outline
          doc.outline.addItem(h1Text, { expanded: false });
          
          doc.fontSize(20).font('Helvetica-Bold').text(h1Text, { align: 'left' });
          doc.moveDown();
        }
        
        itemIndex++;
        
        const faqTitle = faq.Title || faq.Question || 'FAQ';
        
        // H2 for FAQ title
        doc.fontSize(16).font('Helvetica-Bold').text(faqTitle, { align: 'left' });
        doc.moveDown(0.5);

        // Table with properties
        doc.fontSize(10).font('Helvetica');
        
        const properties: Array<[string, string]> = [];
        
        if (faq.ID) {
          properties.push(['ID', faq.ID]);
        }
        if (faq.Title) {
          properties.push(['Title', faq.Title]);
        }
        if (faq.SortOrder !== null) {
          properties.push(['SortOrder', String(faq.SortOrder)]);
        }
        if (faq.Status) {
          properties.push(['Status', faq.Status]);
        }
        if (faq.EditorCreated) {
          properties.push(['EditorCreated', faq.EditorCreated]);
        }
        if (faq.DateCreated) {
          properties.push(['DateCreated', formatDate(faq.DateCreated)]);
        }
        if (faq.EditorModified) {
          properties.push(['EditorModified', faq.EditorModified]);
        }
        if (faq.DateModified) {
          properties.push(['DateModified', formatDate(faq.DateModified)]);
        }
        if (faq.ModuleID) {
          properties.push(['ModuleID', faq.ModuleID]);
        }
        // Parent FAQ title (we know the parent from the loop)
        properties.push(['Parent FAQ', sectionTitle]);

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

        // Question paragraph (if set)
        if (faq.Question && faq.Question.trim().length > 0) {
          const decodedQuestion = decodeHtml(faq.Question);
          doc.fontSize(11).font('Helvetica-Bold').text('Question:', { align: 'left' });
          doc.moveDown(0.3);
          doc.fontSize(10).font('Helvetica').text(decodedQuestion, { align: 'left' });
          doc.moveDown();
        }

        // Answer paragraph (if set)
        if (faq.Answer && faq.Answer.trim().length > 0) {
          const decodedAnswer = decodeHtml(faq.Answer);
          doc.fontSize(11).font('Helvetica-Bold').text('Answer:', { align: 'left' });
          doc.moveDown(0.3);
          doc.fontSize(10).font('Helvetica').text(decodedAnswer, { align: 'left' });
          doc.moveDown();
        }
      }
    }

    // Finalize PDF
    doc.end();
  } catch (error) {
    console.error("Error exporting FAQs:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "An error occurred while exporting FAQs" });
    }
  }
}

