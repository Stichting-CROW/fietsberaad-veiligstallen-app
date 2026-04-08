import { prisma } from "~/server/db";
import { ensureEmailImagesMaxWidth, removeEmptyShortcodes } from "~/utils/mail-template-utils";
import { titleToSlug } from "~/utils/slug";
import { resolveMailBaseUrl } from "~/utils/server/mail-base-url";
import { createMailer, formatFrom, requireSmtpConfig } from "~/utils/server/mail-tools";

export const REMINDER_TEMPLATE_KEY = "mail-reminder-aan-contactpersonen";
export const REMINDER_FREQUENCY_KEY = "mailfrequentie-reminder-contactpersonen";
export const REMINDER_SUBJECT = "VeiligStallen: zijn de fietsenstallingen up to date?";
export const SITE_ID_FIETSBERAAD = "1";
export const REMINDER_START_DATE_UTC = new Date("2026-07-01T00:00:00.000Z");

const BASE_URL = resolveMailBaseUrl();
const BASE_URL_WITHOUT_TRAILING_SLASH = BASE_URL.replace(/\/$/, "");
const P_STYLE = "margin-top:10px;margin-bottom:10px";

export const FREQUENTIE_OPTIONS = [
  "Elk kwartaal",
  "Elk halfjaar",
  "Elk jaar",
  "Elke 2 jaar",
  "Nooit",
] as const;

export type FrequentieOption = (typeof FREQUENTIE_OPTIONS)[number];

export const DEFAULT_FREQUENTIE: FrequentieOption = "Elk jaar";

const REMINDER_OPTION_TO_MONTHS: Record<FrequentieOption, number | null> = {
  "Elk kwartaal": 3,
  "Elk halfjaar": 6,
  "Elk jaar": 12,
  "Elke 2 jaar": 24,
  Nooit: null,
};

type RecipientPreview = {
  to: string;
  subject: string;
  html: string;
  text: string;
  userId: string;
  contactId: string;
};

function nl2br(text: string): string {
  return text.replace(/\n/g, "<br />");
}

function formatTemplateBodyForHtml(templateBody: string): string {
  const html = /<[a-z][\s\S]*>/i.test(templateBody) ? templateBody : nl2br(templateBody);
  const withAbsoluteSrc = html.replace(
    /(src\s*=\s*["'])(\/(?!\/)[^"']*)(["'])/gi,
    (_match, srcPrefix: string, relativePath: string, quote: string) =>
      `${srcPrefix}${BASE_URL_WITHOUT_TRAILING_SLASH}${relativePath}${quote}`
  );
  return ensureEmailImagesMaxWidth(withAbsoluteSrc);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  d.setMonth(d.getMonth() + months);
  return d;
}

function formatStallingName(name: string, status: string | null): string {
  if (status === "aanm") return `${name} (aanmelding)`;
  return name;
}

function buildTabelHtml(
  fietsenstallingen: {
    id: string;
    title: string | null;
    urlName: string | null;
    type: string;
    status?: string | null;
  }[],
  userEmail: string
): string {
  const jaUrl = `${BASE_URL}/beheer/fietsenstallingen/controle?email=${encodeURIComponent(userEmail)}`;
  const neeUrl = `${BASE_URL}/beheer/fietsenstallingen?email=${encodeURIComponent(userEmail)}`;
  const buttons = `<p style="${P_STYLE}"><a href="${jaUrl}" style="display:inline-block;background:#3b82f6;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600;margin-right:8px" target="_blank">Ja, gecontroleerd</a> <a href="${neeUrl}" style="display:inline-block;background:#6b7280;color:#ffffff;text-decoration:none;padding:10px 16px;border-radius:6px;font-weight:600" target="_blank">Nee, nu controleren</a></p>`;
  const actieveStallingen = fietsenstallingen.filter((s) => s.status !== "0");

  if (actieveStallingen.length === 0) {
    return `<p style="${P_STYLE}">Geen fietsenstallingen gekoppeld.</p>` + buttons;
  }

  const sorted = [...actieveStallingen].sort((a, b) => {
    if (a.type !== b.type) return a.type.localeCompare(b.type);
    const nameA = a.title ?? "";
    const nameB = b.title ?? "";
    return nameA.localeCompare(nameB);
  });

  const rows = sorted.map((s) => {
    const baseName = s.title ?? "Onbekend";
    const name = formatStallingName(baseName, s.status ?? null);
    const path = s.urlName ? `/${s.urlName}` : "";
    const nameSlug = s.title ? titleToSlug(s.title) : "";
    const qs = new URLSearchParams();
    if (nameSlug) qs.set("name", nameSlug);
    qs.set("stallingid", s.id);
    const bekijkUrl = `${BASE_URL}${path}/?${qs.toString()}`;
    const bewerkUrl = `${BASE_URL}/beheer/fietsenstallingen?id=${s.id}`;
    return `<tr><td align="left">${name}</td><td align="left">${s.type}</td><td align="left"><a href="${bekijkUrl}" target="_blank">Bekijk</a></td><td align="left"><a href="${bewerkUrl}" target="_blank">Bewerk</a></td></tr>`;
  });

  const table = `<table border="1" cellpadding="8" cellspacing="0" style="border-collapse:collapse;"><thead><tr><th align="left">Naam fietsenstalling</th><th align="left">Type</th><th align="left">Bekijk</th><th align="left">Bewerk</th></tr></thead><tbody>${rows.join("")}</tbody></table>`;
  return table + buttons;
}

function toPlainText(html: string): string {
  return html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

async function getTemplateBody(): Promise<string> {
  const template = await prisma.mailings_standaardteksten.findFirst({
    where: {
      Title: REMINDER_TEMPLATE_KEY,
      SiteID: SITE_ID_FIETSBERAAD,
    },
    select: { Article: true },
  });
  return (template?.Article ?? "").trim();
}

export async function getMailfrequentieMap(): Promise<Record<string, FrequentieOption>> {
  const row = await prisma.mailings_standaardteksten.findFirst({
    where: {
      Title: REMINDER_FREQUENCY_KEY,
      SiteID: SITE_ID_FIETSBERAAD,
    },
    select: { Article: true },
  });
  if (!row?.Article) return {};
  try {
    const parsed = JSON.parse(row.Article) as Record<string, unknown>;
    const result: Record<string, FrequentieOption> = {};
    for (const [contactId, value] of Object.entries(parsed)) {
      if (typeof value === "string" && FREQUENTIE_OPTIONS.includes(value as FrequentieOption)) {
        result[contactId] = value as FrequentieOption;
      }
    }
    return result;
  } catch {
    return {};
  }
}

export async function getAutoReminderPreview(now = new Date()): Promise<RecipientPreview[]> {
  const [templateBodyRaw, frequentieMap] = await Promise.all([
    getTemplateBody(),
    getMailfrequentieMap(),
  ]);

  const templateBody = templateBodyRaw || `Beste contactpersoon van [data-eigenaar] in VeiligStallen,\n\nIs de informatie van onderstaande fietsenstallingen nog correct en up to date?\n\n[tabel]\n\nMet vriendelijke groet,\nVeiligStallen`;

  const contactPersonsSites = await prisma.security_users_sites.findMany({
    where: { IsContact: true },
    select: {
      UserID: true,
      SiteID: true,
      security_users: {
        select: { UserID: true, UserName: true },
      },
    },
  });

  const uniquePairs = new Map<string, { userId: string; contactId: string; email: string }>();
  for (const row of contactPersonsSites) {
    const email = row.security_users?.UserName;
    if (!email || !email.includes("@")) continue;
    const key = `${row.UserID}:${row.SiteID}`;
    if (!uniquePairs.has(key)) {
      uniquePairs.set(key, {
        userId: row.UserID,
        contactId: row.SiteID,
        email,
      });
    }
  }

  const pairs = [...uniquePairs.values()];
  if (pairs.length === 0) return [];

  const siteIds = [...new Set(pairs.map((p) => p.contactId))];

  const [controles, gemeenten, fietsenstallingen] = await Promise.all([
    prisma.contacts_datakwaliteitcontroles.groupBy({
      by: ["contact_id"],
      where: { contact_id: { in: siteIds } },
      _max: { createdAt: true },
    }),
    prisma.contacts.findMany({
      where: { ID: { in: siteIds } },
      select: { ID: true, UrlName: true, CompanyName: true },
    }),
    prisma.fietsenstallingen.findMany({
      where: {
        SiteID: { in: siteIds },
        StallingsID: { not: null },
        Title: { not: "Systeemstalling" },
        contacts_fietsenstallingen_SiteIDTocontacts: { Status: { not: "0" } },
      },
      select: {
        ID: true,
        Title: true,
        SiteID: true,
        Type: true,
        Status: true,
        fietsenstalling_type: { select: { name: true } },
      },
    }),
  ]);

  const lastControleBySite = new Map(
    controles.map((c) => [c.contact_id, c._max.createdAt ?? null])
  );
  const urlNameMap = new Map(gemeenten.map((g) => [g.ID, g.UrlName]));
  const contactNameMap = new Map(gemeenten.map((g) => [g.ID, g.CompanyName ?? g.ID]));

  const stallingenBySite = new Map<
    string,
    { id: string; title: string | null; urlName: string | null; type: string; status: string | null }[]
  >();
  for (const f of fietsenstallingen) {
    if (!f.SiteID) continue;
    const urlName = urlNameMap.get(f.SiteID) ?? null;
    const type = f.fietsenstalling_type?.name ?? f.Type ?? "Onbekend";
    const list = stallingenBySite.get(f.SiteID) ?? [];
    list.push({ id: f.ID, title: f.Title, urlName, type, status: f.Status });
    stallingenBySite.set(f.SiteID, list);
  }

  const preview: RecipientPreview[] = [];
  for (const pair of pairs) {
    const selectedFreq = frequentieMap[pair.contactId] ?? DEFAULT_FREQUENTIE;
    const months = REMINDER_OPTION_TO_MONTHS[selectedFreq];
    if (months === null) continue;

    const lastControleAt = lastControleBySite.get(pair.contactId) ?? null;
    if (lastControleAt) {
      const nextReminderAt = addMonths(lastControleAt, months);
      if (now < nextReminderAt) continue;
    }

    const tabelHtml = buildTabelHtml(stallingenBySite.get(pair.contactId) ?? [], pair.email);
    const dataEigenaar = contactNameMap.get(pair.contactId) ?? pair.contactId;
    const body = removeEmptyShortcodes(templateBody, "", "");
    const html = formatTemplateBodyForHtml(body)
      .replace(/\[tabel\]/g, tabelHtml)
      .replace(/\[intro\]/g, "")
      .replace(/\[outro\]/g, "")
      .replace(/\[data-eigenaar\]/g, dataEigenaar);

    preview.push({
      to: pair.email,
      subject: REMINDER_SUBJECT,
      html,
      text: toPlainText(html),
      userId: pair.userId,
      contactId: pair.contactId,
    });
  }

  return preview;
}

export async function sendAutoReminderEmails(now = new Date()) {
  const cfg = requireSmtpConfig();
  if (!cfg.ok) {
    throw new Error(cfg.error);
  }
  const transporter = createMailer(cfg);
  const preview = await getAutoReminderPreview(now);

  for (const item of preview) {
    await transporter.sendMail({
      from: formatFrom(cfg.from),
      to: item.to,
      subject: item.subject,
      html: item.html,
      text: item.text,
    });
  }

  return {
    sent: preview.length,
    recipients: preview.map((p) => ({ to: p.to, subject: p.subject })),
  };
}
