import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { ensureEmailImagesMaxWidth, removeEmptyShortcodes } from "~/utils/mail-template-utils";
import {
  createMailer,
  formatFrom,
  requireSmtpConfig,
} from "~/utils/server/mail-tools";
import { resolveMailBaseUrl } from "~/utils/server/mail-base-url";
import { titleToSlug } from "~/utils/slug";
import { z } from "zod";

const BASE_URL = resolveMailBaseUrl();
const BASE_URL_WITHOUT_TRAILING_SLASH = BASE_URL.replace(/\/$/, "");

const P_STYLE = "margin-top:10px;margin-bottom:10px";

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

const schema = z.object({
  subject: z.string().min(1),
  templateBody: z.string(),
  introText: z.string(),
  outroText: z.string(),
  sampleData: z.object({
    fietsenstallingen: z.array(
      z.object({
        id: z.string(),
        title: z.string().nullable(),
        urlName: z.string().nullable(),
        type: z.string(),
        status: z.string().nullable().optional(),
      })
    ),
    dataEigenaar: z.string(),
  }),
});

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

  const { subject, templateBody, introText, outroText, sampleData } = parsed.data;
  const tabelHtml = buildTabelHtml(sampleData.fietsenstallingen, session.user.email);
  const dataEigenaar = sampleData.dataEigenaar;

  const body = removeEmptyShortcodes(templateBody, introText, outroText);
  const html = formatTemplateBodyForHtml(body)
    .replace(/\[tabel\]/g, tabelHtml)
    .replace(/\[intro\]/g, nl2br(introText))
    .replace(/\[outro\]/g, nl2br(outroText))
    .replace(/\[data-eigenaar\]/g, dataEigenaar);

  const transporter = createMailer(cfg);
  try {
    await transporter.sendMail({
      from: formatFrom(cfg.from),
      to: session.user.email,
      subject: `[TEST] ${subject}`,
      html,
      text: html.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim(),
    });
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("send-test-mail - error:", e);
    res.status(500).json({ error: "Failed to send test email" });
  }
}
