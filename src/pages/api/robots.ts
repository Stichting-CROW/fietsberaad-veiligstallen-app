import type { NextApiRequest, NextApiResponse } from "next";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://beta.veiligstallen.nl";
const BASE = BASE_URL.replace(/\/$/, "");
const IS_ACCEPTANCE = process.env.NEXT_PUBLIC_APP_ENV === "acceptance" || BASE.includes("vstfb-eu-acc");

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).end();
    return;
  }

  if (IS_ACCEPTANCE) {
    res.setHeader("Content-Type", "text/plain");
    res.send(`User-agent: *
Disallow: /
`);
    return;
  }

  res.setHeader("Content-Type", "text/plain");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate");
  res.send(`User-agent: *
Disallow: /api/
Disallow: /beheer/
Disallow: /login
Allow: /

Sitemap: ${BASE}/sitemap.xml
`);
}
