import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://beta.veiligstallen.nl";
const BASE = BASE_URL.replace(/\/$/, "");

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function urlEntry(loc: string, changefreq = "weekly", priority = "0.8"): string {
  return `<url><loc>${escapeXml(loc)}</loc><changefreq>${changefreq}</changefreq><priority>${priority}</priority></url>`;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end();
    return;
  }

  try {
    const urls: string[] = [];

    // Homepage
    urls.push(urlEntry(`${BASE}/`, "weekly", "1.0"));

    // Public parkings with SiteID and contact UrlName
    const parkings = await prisma.fietsenstallingen.findMany({
      where: {
        Status: "1",
        Title: { not: "Systeemstalling" },
        StallingsID: { not: null },
        SiteID: { not: null },
        contacts_fietsenstallingen_SiteIDTocontacts: {
          Status: { not: "0" },
          UrlName: { not: null },
        },
      },
      select: {
        ID: true,
        contacts_fietsenstallingen_SiteIDTocontacts: {
          select: { UrlName: true },
        },
      },
    });

    for (const p of parkings) {
      const urlName = p.contacts_fietsenstallingen_SiteIDTocontacts?.UrlName;
      if (urlName) {
        urls.push(urlEntry(`${BASE}/${urlName}/?stallingid=${p.ID}`, "weekly", "0.8"));
      } else {
        urls.push(urlEntry(`${BASE}/?stallingid=${p.ID}`, "weekly", "0.8"));
      }
    }

    // Content pages (articles) - fetch first so we can add article municipalities
    const articles = await prisma.articles.findMany({
      where: {
        Status: "1",
        SiteID: { not: null },
        Title: { not: null },
        ModuleID: { in: ["veiligstallen", "veiligstallenprisma"] },
        OR: [
          { Archived: null },
          { Archived: "0" },
          { Archived: { not: "1" } },
        ],
      },
      select: { Title: true, SiteID: true },
    });

    const siteIds = [...new Set(articles.map((a) => a.SiteID).filter(Boolean))] as string[];
    const contactsMap = new Map<string, string>();
    if (siteIds.length > 0) {
      const contacts = await prisma.contacts.findMany({
        where: { ID: { in: siteIds } },
        select: { ID: true, UrlName: true },
      });
      for (const c of contacts) {
        if (c.UrlName) contactsMap.set(c.ID, c.UrlName);
      }
    }

    // Municipality index pages (contacts with UrlName that have parkings)
    const municipalitiesWithParkings = await prisma.contacts.findMany({
      where: {
        UrlName: { not: null },
        Status: { not: "0" },
        fietsenstallingen_fietsenstallingen_SiteIDTocontacts: {
          some: { Status: "1" },
        },
      },
      select: { UrlName: true },
    });

    const municipalityUrlNames = new Set(
      municipalitiesWithParkings
        .map((c) => c.UrlName)
        .filter((u): u is string => !!u)
    );

    // Add municipalities that have articles but might not have parkings
    for (const siteId of siteIds) {
      const urlName = contactsMap.get(siteId);
      if (urlName) municipalityUrlNames.add(urlName);
    }

    for (const urlName of municipalityUrlNames) {
      urls.push(urlEntry(`${BASE}/${urlName}`, "weekly", "0.9"));
    }

    for (const a of articles) {
      const urlName = a.SiteID ? contactsMap.get(a.SiteID) : null;
      if (urlName && a.Title) {
        urls.push(urlEntry(`${BASE}/${urlName}/${a.Title}`, "weekly", "0.7"));
      }
    }

    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;

    res.setHeader("Content-Type", "application/xml");
    res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate");
    res.status(200).send(xml);
  } catch (error) {
    console.error("sitemap.xml error:", error);
    res.status(500).json({ error: "Failed to generate sitemap" });
  }
}
