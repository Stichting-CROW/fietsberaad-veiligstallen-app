import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";

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

/**
 * Escape HTML for safe display
 */
function escapeHtml(text: string | null | undefined): string {
  if (!text) return '';
  const map: Record<string, string> = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  };
  return String(text).replace(/[&<>"']/g, (m) => map[m] || m);
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

  // Check that the current organization is Fietsberaad (SiteID "1")
  const activeContactId = session.user.activeContactId;
  if (activeContactId !== '1') {
    res.status(403).json({ error: "Access denied - export only available for Fietsberaad organization" });
    return;
  }

  try {
    // Fetch all FAQs - matching the structure used in the FAQ page
    const allFaqs = await prisma.faq.findMany({
      where: {
        Status: '1', // Only active FAQs
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

    // Sections: FAQs with Title !== null AND Title !== ''
    const sections = allFaqs.filter(
      (faq) => faq.Title !== null && faq.Title !== undefined && faq.Title.trim().length > 0
    );
    
    // Items: FAQs with Title === null OR Title === ''
    const items = allFaqs.filter(
      (faq) =>
        (faq.Title === null || faq.Title === undefined || faq.Title.trim().length === 0) &&
        ((faq.Question && faq.Question.trim().length > 0) ||
         (faq.Answer && faq.Answer.trim().length > 0))
    );

    if (sections.length === 0) {
      res.status(404).json({ error: "No FAQ sections found" });
      return;
    }

    // Filter to only sections that have items
    // Sections maintain their order from the database query (sorted by SortOrder globally)
    // This matches the behavior of the GUI API endpoint
    const sectionsWithItems = sections.filter(section => {
      // Filter items for this section from the globally sorted items array
      // This matches exactly how the GUI component filters items (preserving order from global sort)
      const sectionItems = items.filter(item => item.ParentID === section.ID);
      return sectionItems.length > 0;
    });

    if (sectionsWithItems.length === 0) {
      res.status(404).json({ error: "No FAQ sections with items found" });
      return;
    }

    // Get SiteID mappings for all FAQs through contacts_faq
    // Include all links regardless of Status (no Status filter)
    const allFaqIds = allFaqs.map(faq => faq.ID);
    const contactsFaqs = await prisma.contacts_faq.findMany({
      where: {
        FaqID: { in: allFaqIds },
      },
      select: {
        SiteID: true,
        FaqID: true,
      },
    });

    // Create a map: FaqID -> SiteIDs[]
    const faqToSiteIds = new Map<string, string[]>();
    for (const cf of contactsFaqs) {
      if (!faqToSiteIds.has(cf.FaqID)) {
        faqToSiteIds.set(cf.FaqID, []);
      }
      faqToSiteIds.get(cf.FaqID)!.push(cf.SiteID);
    }

    // Get all unique SiteIDs
    const siteIDs = [...new Set(contactsFaqs.map(cf => cf.SiteID))];

    // Fetch company names for all SiteIDs - this also filters out non-existent contacts
    const contacts = await prisma.contacts.findMany({
      where: {
        ID: { in: siteIDs },
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

    // Filter to only SiteIDs that exist in the contacts table
    const validSiteIDs = siteIDs.filter(siteID => companyNameMap.has(siteID));

    // Sort SiteIDs: SiteID "1" first, then others alphabetically by company name
    const sortedSiteIDs = validSiteIDs.sort((a, b) => {
      if (a === '1') return -1;
      if (b === '1') return 1;
      const nameA = companyNameMap.get(a) ?? a;
      const nameB = companyNameMap.get(b) ?? b;
      return String(nameA).localeCompare(String(nameB), 'nl-NL');
    });

    // Generate HTML
    const dateStr = new Date().toISOString().split('T')[0]?.replace(/-/g, '') || '';
    const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Export van alle FAQ's</title>
  <style>
    body {
      font-family: Arial, sans-serif;
      max-width: 1200px;
      margin: 0 auto;
      padding: 20px;
      line-height: 1.6;
    }
    h1 {
      text-align: center;
      color: #333;
      border-bottom: 2px solid #333;
      padding-bottom: 10px;
    }
    h2 {
      color: #555;
      margin-top: 30px;
      border-bottom: 1px solid #ccc;
      padding-bottom: 5px;
    }
    h3 {
      color: #666;
      margin-top: 20px;
    }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 20px 0;
    }
    th, td {
      border: 1px solid #ddd;
      padding: 8px;
      text-align: left;
    }
    th {
      background-color: #f2f2f2;
      font-weight: bold;
    }
    .faq-section {
      margin-bottom: 30px;
      page-break-inside: avoid;
    }
    .org-section {
      margin-bottom: 40px;
      page-break-inside: avoid;
      padding: 20px;
      background-color: #f9f9f9;
      border: 1px solid #ddd;
    }
    .org-faq-group {
      margin: 15px 0;
    }
    .org-faq-group ul {
      list-style-type: disc;
      padding-left: 30px;
    }
    .org-faq-group li {
      margin: 5px 0;
    }
    .faq-item {
      margin: 15px 0;
      padding: 15px;
      background-color: #fafafa;
      border-left: 4px solid #333;
    }
    h4 {
      color: #555;
      margin-top: 15px;
      margin-bottom: 10px;
    }
    .question {
      font-weight: bold;
      margin-bottom: 10px;
      color: #333;
    }
    .answer {
      margin-top: 10px;
      white-space: pre-wrap;
    }
    .meta {
      font-size: 0.9em;
      color: #666;
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ccc;
    }
    ul {
      list-style-type: none;
      padding-left: 0;
    }
    li {
      margin: 10px 0;
    }
    a {
      color: #0366d6;
      text-decoration: none;
    }
    a:hover {
      text-decoration: underline;
    }
    .toc-toggle {
      cursor: pointer;
      user-select: none;
      color: #0366d6;
      font-weight: normal;
    }
    .toc-toggle:hover {
      text-decoration: underline;
    }
    .toc-toggle::before {
      content: '▶ ';
      display: inline-block;
      transition: transform 0.2s;
      font-size: 0.8em;
    }
    .toc-toggle.expanded::before {
      transform: rotate(90deg);
    }
    .toc-nested {
      display: none;
      margin-left: 20px;
      margin-top: 5px;
    }
    .toc-nested.expanded {
      display: block;
    }
    .toc-nested li {
      margin: 5px 0;
    }
  </style>
  <script>
    function toggleToc(event) {
      event.preventDefault();
      const toggle = event.target.closest('.toc-toggle');
      const nested = toggle.nextElementSibling;
      if (nested) {
        toggle.classList.toggle('expanded');
        nested.classList.toggle('expanded');
      }
    }
  </script>
</head>
<body>
  <h1>Export van alle FAQ's</h1>
  <div class="meta">
    Gegenereerd op: ${new Date().toLocaleString('nl-NL')}
  </div>

  <h2>Inhoudsopgave</h2>
  <ul>
    <li>
      <a href="#faq-artikelen">Faq artikelen</a>
      <ul style="display: block; margin-left: 20px;">
${sectionsWithItems.map((section) => {
  // Filter items for this section from the globally sorted items array, then sort
  const sectionItems = items.filter(item => item.ParentID === section.ID)
    .sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0));
  
  return `        <li>
          <a href="#section-${section.ID}">${escapeHtml(section.Title || '')}</a> (${sectionItems.length} ${sectionItems.length === 1 ? 'item' : 'items'})
          <span class="toc-toggle" onclick="toggleToc(event)"></span>
          <ul class="toc-nested">
${sectionItems.map((item) => {
  // Use Question as title, or first part of Answer if no Question, or "FAQ Item" as fallback
  const itemTitle = item.Question && item.Question.trim().length > 0 
    ? item.Question.replace(/<[^>]*>/g, '').substring(0, 100) + (item.Question.length > 100 ? '...' : '')
    : (item.Answer && item.Answer.trim().length > 0
      ? item.Answer.replace(/<[^>]*>/g, '').substring(0, 100) + (item.Answer.length > 100 ? '...' : '')
      : 'FAQ Item');
  const itemId = `faq-item-${item.ID}`;
  return `            <li><a href="#${itemId}">${escapeHtml(itemTitle)}</a></li>`;
}).join('\n')}
          </ul>
        </li>`;
}).join('\n')}
      </ul>
    </li>
    <li>
      <a href="#faq-artikelen-per-organisatie">Faq artikelen per organisatie</a>
      <span class="toc-toggle" onclick="toggleToc(event)"></span>
      <ul class="toc-nested">
${sortedSiteIDs.map((siteId) => {
  const companyName = companyNameMap.get(siteId) ?? siteId;
  // Count sections that have FAQs linked to this site
  let sectionCount = 0;
  for (const section of sectionsWithItems) {
    const sectionItems = items.filter(item => item.ParentID === section.ID);
    const hasLinkedItems = sectionItems.some(item => {
      const siteIdsForItem = faqToSiteIds.get(item.ID) || [];
      return siteIdsForItem.includes(siteId);
    });
    if (hasLinkedItems) sectionCount++;
  }
  if (sectionCount === 0) return '';
  return `        <li><a href="#org-${siteId}">${escapeHtml(companyName)}</a></li>`;
}).filter(Boolean).join('\n')}
      </ul>
    </li>
  </ul>

  <div id="faq-artikelen">
    <h2>Faq artikelen</h2>
    
${sectionsWithItems.map((section) => {
  // Filter items for this section from the globally sorted items array, then sort
  const sectionItems = items.filter(item => item.ParentID === section.ID)
    .sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0));
  
  return `
    <div class="faq-section" id="section-${section.ID}">
      <h3>${escapeHtml(section.Title || '')}</h3>
      
${sectionItems.map((item) => {
  // Use Question as title, or first part of Answer if no Question, or "FAQ Item" as fallback
  const itemTitle = item.Question && item.Question.trim().length > 0 
    ? item.Question.replace(/<[^>]*>/g, '').substring(0, 100) + (item.Question.length > 100 ? '...' : '')
    : (item.Answer && item.Answer.trim().length > 0
      ? item.Answer.replace(/<[^>]*>/g, '').substring(0, 100) + (item.Answer.length > 100 ? '...' : '')
      : 'FAQ Item');
  
  const properties: Array<[string, string]> = [];
  if (item.Title) properties.push(['Title', item.Title]);
  if (item.SortOrder !== null) properties.push(['SortOrder', String(item.SortOrder)]);
  if (item.Status) {
    const statusText = item.Status === '1' ? 'zichtbaar' : item.Status === '0' ? 'niet zichtbaar' : item.Status;
    properties.push(['Status', statusText]);
  }
  if (item.EditorCreated) properties.push(['EditorCreated', item.EditorCreated]);
  if (item.DateCreated) properties.push(['DateCreated', formatDate(item.DateCreated)]);
  if (item.EditorModified) properties.push(['EditorModified', item.EditorModified]);
  if (item.DateModified) properties.push(['DateModified', formatDate(item.DateModified)]);
  if (item.ModuleID) properties.push(['ModuleID', item.ModuleID]);
  
  const itemId = `faq-item-${item.ID}`;
  return `
      <div class="faq-item" id="${itemId}">
        <h4>${escapeHtml(itemTitle)}</h4>
        
        <table>
          <thead>
            <tr>
              <th>Eigenschap</th>
              <th>Waarde</th>
            </tr>
          </thead>
          <tbody>
${properties.map(([key, value]) => `            <tr>
              <td>${escapeHtml(key)}</td>
              <td>${escapeHtml(String(value || ''))}</td>
            </tr>`).join('\n')}
          </tbody>
        </table>

${item.Question && item.Question.trim().length > 0 ? `
        <div class="question">Vraag:</div>
        <div>${item.Question}</div>
` : ''}
${item.Answer && item.Answer.trim().length > 0 ? `
        <br />
        <div class="question">Antwoord:</div>
        <div class="answer">${item.Answer}</div>
` : ''}
      </div>
`;
}).join('\n')}
    </div>
`;
}).join('\n')}
  </div>

  <div id="faq-artikelen-per-organisatie">
    <h2>Faq artikelen per organisatie</h2>
    
${sortedSiteIDs.map((siteId) => {
  const companyName = companyNameMap.get(siteId) ?? siteId;
  
  // Get sections that have FAQs linked to this site
  const orgSections = sectionsWithItems.filter(section => {
    const sectionItems = items.filter(item => item.ParentID === section.ID);
    return sectionItems.some(item => {
      const siteIdsForItem = faqToSiteIds.get(item.ID) || [];
      return siteIdsForItem.includes(siteId);
    });
  });
  
  if (orgSections.length === 0) return '';
  
  return `
    <div class="org-section" id="org-${siteId}">
      <h3>${escapeHtml(companyName)}</h3>
      
${orgSections.map((section) => {
  const sectionItems = items.filter(item => {
    if (item.ParentID !== section.ID) return false;
    const siteIdsForItem = faqToSiteIds.get(item.ID) || [];
    return siteIdsForItem.includes(siteId);
  }).sort((a, b) => (a.SortOrder ?? 0) - (b.SortOrder ?? 0));
  
  if (sectionItems.length === 0) return '';
  
  return `
      <div class="org-faq-group">
        <h4>${escapeHtml(section.Title || '')}</h4>
        <ul>
${sectionItems.map((item) => {
  const itemTitle = item.Question && item.Question.trim().length > 0 
    ? item.Question.replace(/<[^>]*>/g, '').substring(0, 100) + (item.Question.length > 100 ? '...' : '')
    : (item.Answer && item.Answer.trim().length > 0
      ? item.Answer.replace(/<[^>]*>/g, '').substring(0, 100) + (item.Answer.length > 100 ? '...' : '')
      : 'FAQ Item');
  const itemId = `faq-item-${item.ID}`;
  return `          <li><a href="#${itemId}">${escapeHtml(itemTitle)}</a></li>`;
}).join('\n')}
        </ul>
      </div>
`;
}).filter(Boolean).join('\n')}
    </div>
`;
}).filter(Boolean).join('\n')}
  </div>

</body>
</html>`;

    // Set response headers for HTML download
    const filename = `${dateStr}-faqs-rapport.html`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    res.status(200).send(html);
  } catch (error) {
    console.error("Error exporting FAQs:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "An error occurred while exporting FAQs" });
    }
  }
}
