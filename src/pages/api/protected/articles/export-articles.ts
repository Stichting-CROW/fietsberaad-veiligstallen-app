import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
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

    // Generate HTML
    const dateStr = new Date().toISOString().split('T')[0]?.replace(/-/g, '') || '';
    const html = `<!DOCTYPE html>
<html lang="nl">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Export van alle artikelen</title>
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
    .article-section {
      margin-bottom: 40px;
      page-break-inside: avoid;
    }
    .company-header {
      background-color: #f9f9f9;
      padding: 15px;
      margin: 20px 0;
      border-left: 4px solid #333;
    }
    .abstract, .article {
      margin: 15px 0;
      padding: 10px;
      background-color: #fafafa;
    }
    .meta {
      font-size: 0.9em;
      color: #666;
      text-align: center;
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #ccc;
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
  <h1>Export van alle artikelen</h1>
  <div class="meta">
    Gegenereerd op: ${new Date().toLocaleString('nl-NL')}
  </div>

  <h2>Inhoudsopgave</h2>
  <ul>
${sortedSiteIDs.map((siteID) => {
  const companyArticles = articlesByCompany.get(siteID) || [];
  const companyName = companyNameMap.get(siteID) || siteID;
  const articleCount = companyArticles.length;
  return `    <li>
      <a href="#company-${siteID}">${escapeHtml(companyName)} (${articleCount} ${articleCount === 1 ? 'pagina' : 'pagina\'s'})</a>
      <span class="toc-toggle" onclick="toggleToc(event)"></span>
      <ul class="toc-nested">
${companyArticles.map((article) => {
  const title = article.DisplayTitle || article.Title || 'Geen titel';
  const articleId = `article-${article.ID}`;
  return `        <li><a href="#${articleId}">${escapeHtml(title)}</a></li>`;
}).join('\n')}
      </ul>
    </li>`;
}).join('\n')}
  </ul>

${sortedSiteIDs.map((siteID) => {
  const companyArticles = articlesByCompany.get(siteID) || [];
  const companyName = companyNameMap.get(siteID) || siteID;
  const totalCount = companyArticles.length;

  return `
  <div class="company-header" id="company-${siteID}">
    <h2>${escapeHtml(companyName)} (${totalCount} ${totalCount === 1 ? 'pagina' : 'pagina\'s'})</h2>
  </div>

${companyArticles.map((article) => {
  const title = article.DisplayTitle || article.Title || 'Geen titel';
  
  const properties: Array<[string, string]> = [];
  if (article.ID) properties.push(['ID', article.ID]);
  if (article.DisplayTitle) properties.push(['DisplayTitle', article.DisplayTitle]);
  if (article.SortOrder !== null) properties.push(['SortOrder', String(article.SortOrder)]);
  if (article.Status) properties.push(['Status', article.Status]);
  if (article.Navigation) properties.push(['Navigation', article.Navigation]);
  if (article.System) properties.push(['System', article.System]);
  if (article.EditorCreated) properties.push(['EditorCreated', article.EditorCreated]);
  if (article.DateCreated) properties.push(['DateCreated', formatDate(article.DateCreated)]);
  if (article.EditorModified) properties.push(['EditorModified', article.EditorModified]);
  if (article.DateModified) properties.push(['DateModified', formatDate(article.DateModified)]);
  if (article.ModuleID) properties.push(['ModuleID', article.ModuleID]);
  if (article.ParentID) {
    const parentTitle = parentTitleMap.get(article.ParentID) || article.ParentID;
    properties.push(['Parent Article', parentTitle]);
  }

  const articleId = `article-${article.ID}`;
  return `
  <div class="article-section" id="${articleId}">
    <h3>${escapeHtml(title)}</h3>
    
    <table>
      <thead>
        <tr>
          <th>Eigenschap</th>
          <th>Waarde</th>
        </tr>
      </thead>
      <tbody>
${properties.map(([key, value]) => `        <tr>
          <td>${escapeHtml(key)}</td>
          <td>${escapeHtml(String(value || ''))}</td>
        </tr>`).join('\n')}
      </tbody>
    </table>

${article.Abstract && article.Abstract.trim().length > 0 ? `
    <div class="abstract">
      <strong>Abstract:</strong>
      <div style="margin-top: 10px;">${article.Abstract}</div>
    </div>
` : ''}

${article.Article && article.Article.trim().length > 0 ? `
    <div class="article">
      <strong>Article:</strong>
      <div style="margin-top: 10px;">${article.Article}</div>
    </div>
` : ''}
  </div>
`;
}).join('\n')}
`;
}).join('\n')}

</body>
</html>`;

    // Set response headers for HTML download
    const filename = `${dateStr}-artikelen-export.html`;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="${filename}"`
    );

    res.status(200).send(html);
  } catch (error) {
    console.error("Error exporting articles:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "An error occurred while exporting articles" });
    }
  }
}
