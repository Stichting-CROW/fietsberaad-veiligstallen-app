import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { removeEmptyShortcodes } from "~/utils/mail-template-utils";
import {
  createMailer,
  formatFrom,
  requireSmtpConfig,
} from "~/utils/server/mail-tools";
import { titleToSlug } from "~/utils/slug";
import { z } from "zod";

const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://beta.veiligstallen.nl";

function nl2br(text: string): string {
  return text.replace(/\n/g, "<br />");
}

const schema = z.object({
  subject: z.string().min(1),
  templateBody: z.string(),
  introText: z.string(),
  outroText: z.string(),
  recipients: z.array(z.object({ userId: z.string(), contactId: z.string() })),
});

const P_STYLE = "margin-top:10px;margin-bottom:10px";

function buildTabelHtml(
  fietsenstallingen: { id: string; title: string | null; urlName: string | null }[]
): string {
  const buttons = `<p style="${P_STYLE}"><a href="" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;margin-right:8px" target="_blank">Ja, gecontroleerd</a> <a href="${BASE_URL}/beheer/fietsenstallingen" style="display:inline-block;background:#6b7280;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600" target="_blank">Nee, nu controleren</a></p>`;
  if (fietsenstallingen.length === 0) {
    return `<p style="${P_STYLE}">Geen fietsenstallingen gekoppeld.</p>` + buttons;
  }
  const rows = fietsenstallingen.map((s) => {
    const name = s.title ?? "Onbekend";
    const path = s.urlName ? `/${s.urlName}` : "";
    const nameSlug = s.title ? titleToSlug(s.title) : "";
    const qs = new URLSearchParams();
    if (nameSlug) qs.set("name", nameSlug);
    qs.set("stallingid", s.id);
    const bekijkUrl = `${BASE_URL}${path}/?${qs.toString()}`;
    const bewerkUrl = `${BASE_URL}/beheer/fietsenstallingen?id=${s.id}`;
    return `<tr><td>${name}</td><td><a href="${bekijkUrl}" target="_blank">Bekijk</a></td><td><a href="${bewerkUrl}" target="_blank">Bewerk</a></td></tr>`;
  });
  const table = `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;"><thead><tr><th align="left">Naam fietsenstalling</th><th align="left">Bekijk</th><th align="left">Bewerk</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
  return table + buttons;
}

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<{ ok?: boolean; error?: string }>
) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user?.email) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const hasSuperadmin = userHasRight(
    session.user.securityProfile,
    VSSecurityTopic.fietsberaad_superadmin
  );
  if (!hasSuperadmin) {
    res.status(403).json({ error: "Forbidden: fietsberaad_superadmin required" });
    return;
  }

  const parsed = schema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "Invalid request body" });
    return;
  }

  const cfg = requireSmtpConfig();
  if (!cfg.ok) {
    res.status(500).json({ error: cfg.error });
    return;
  }

  const { subject, templateBody, introText, outroText, recipients } = parsed.data;
  const bcc = session.user.email;

  const contactPersonsSites = await prisma.security_users_sites.findMany({
    where: {
      IsContact: true,
      OR: recipients.map((r) => ({ UserID: r.userId, SiteID: r.contactId })),
    },
    select: {
      UserID: true,
      SiteID: true,
      security_users: {
        select: { UserID: true, UserName: true, DisplayName: true },
      },
    },
  });

  const siteIds = [...new Set(recipients.map((r) => r.contactId))];

  const fietsenstallingen = await prisma.fietsenstallingen.findMany({
    where: {
      SiteID: { in: siteIds },
      Status: { not: "0" },
      StallingsID: { not: null },
      Title: { not: "Systeemstalling" },
      contacts_fietsenstallingen_SiteIDTocontacts: { Status: { not: "0" } },
    },
    select: { ID: true, Title: true, SiteID: true },
  });

  const gemeenten = await prisma.contacts.findMany({
    where: { ID: { in: siteIds } },
    select: { ID: true, UrlName: true, CompanyName: true },
  });
  const urlNameMap = new Map(gemeenten.map((g) => [g.ID, g.UrlName]));
  const contactNameMap = new Map(gemeenten.map((g) => [g.ID, g.CompanyName ?? g.ID]));

  const stallingenBySite = new Map<string, { id: string; title: string | null; urlName: string | null }[]>();
  for (const f of fietsenstallingen) {
    if (!f.SiteID) continue;
    const urlName = urlNameMap.get(f.SiteID) ?? null;
    const list = stallingenBySite.get(f.SiteID) ?? [];
    list.push({ id: f.ID, title: f.Title, urlName });
    stallingenBySite.set(f.SiteID, list);
  }

  const transporter = createMailer(cfg);

  for (const row of contactPersonsSites) {
    const user = row.security_users;
    if (!user?.UserName) continue;

    const contactId = row.SiteID;
    const stallings = stallingenBySite.get(contactId) ?? [];
    const tabelHtml = buildTabelHtml(stallings);
    const dataEigenaar = contactNameMap.get(contactId) ?? contactId;

    const body = removeEmptyShortcodes(templateBody, introText, outroText);
    let html = nl2br(body)
      .replace(/\[tabel\]/g, tabelHtml)
      .replace(/\[intro\]/g, nl2br(introText))
      .replace(/\[outro\]/g, nl2br(outroText))
      .replace(/\[data-eigenaar\]/g, dataEigenaar);

    try {
      await transporter.sendMail({
        from: formatFrom(cfg.from),
        to: user.UserName,
        bcc,
        subject,
        html,
        text: html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
      });
    } catch (e) {
      console.error("send-reminder-mail - error:", e);
      res.status(500).json({ error: `Failed to send email to ${user.UserName}` });
      return;
    }
  }

  res.status(200).json({ ok: true });
}
