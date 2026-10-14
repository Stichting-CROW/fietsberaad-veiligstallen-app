import { captureBuurtstallingenMail } from "~/modules/buurtstallingen/application/mail-capture";
import { prisma } from "~/server/db";
import { createMailer, formatFrom, requireSmtpConfig } from "~/utils/server/mail-tools";

export async function sendCitizenMail(input: {
  to: string;
  cc?: string | null;
  subject: string;
  html: string;
}): Promise<void> {
  captureBuurtstallingenMail(input);
  const cfg = requireSmtpConfig();
  if (!cfg.ok) {
    console.error("Accountmail niet verstuurd:", cfg.error);
    return;
  }
  const transporter = createMailer(cfg);
  await transporter.sendMail({
    from: formatFrom(cfg.from),
    replyTo: cfg.replyTo,
    to: input.to,
    cc: input.cc || undefined,
    subject: input.subject,
    html: input.html,
  });
}

export async function sendOpsMail(subject: string, html: string): Promise<void> {
  const to = process.env.BUURTSTALLINGEN_OPS_EMAIL ?? "veiligstallen@gmail.com";
  await sendCitizenMail({ to, subject, html });
}

/** Absolute origin for links in mails sent outside a request (cron, webhook). */
export function mailOrigin(): string {
  for (const value of [process.env.NEXTAUTH_URL, process.env.NEXT_PUBLIC_SITE_URL]) {
    try {
      if (value?.trim()) return new URL(value.trim()).origin;
    } catch {
      // try the next setting
    }
  }
  return "https://www.veiligstallen.nl";
}

type MailAccount = {
  Email: string | null;
  FirstName: string | null;
  MiddleName: string | null;
  LastName: string | null;
  Sex: string | null;
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

// BikeparkAccount.getDisplayName.
export function accountDisplayName(account: Pick<MailAccount, "FirstName" | "MiddleName" | "LastName">): string {
  return `${account.FirstName ?? ""} ${account.MiddleName ?? ""} ${account.LastName ?? ""}`.replace("  ", " ");
}

function mailLogo(file: string | null | undefined): string {
  const value = file?.trim();
  if (!value) return "https://www.veiligstallen.nl/resources/images/logo.png";
  if (/^https?:\/\//.test(value)) return value;
  if (value.startsWith("[local]")) return `${mailOrigin()}${value.replace("[local]", "/api")}`;
  return `https://static.veiligstallen.nl/library/logo/${value}`;
}

// customtags/send_mail_account.cfm
async function accountMailLayout(account: MailAccount, councilId: string | null | undefined, message: string): Promise<string> {
  const council = councilId
    ? await prisma.contacts.findUnique({
        where: { ID: councilId },
        select: { CompanyName: true, CompanyLogo: true, ThemeColor1: true, Address1: true, Zip1: true, City1: true, btwNummer: true, kvkNummer: true },
      })
    : null;
  const theme = council?.ThemeColor1?.replace("#", "");
  const name = accountDisplayName(account).trim() ? ` ${escapeHtml(accountDisplayName(account))},` : ",";
  // The ColdFusion layout tests "man" twice, so only men get a gendered greeting.
  const greeting = account.Sex === "man" ? `Geachte heer${name}` : `Geachte heer/mevrouw${name}`;
  const signature = council
    ? `Gemeente ${escapeHtml(council.CompanyName ?? "")}<br />
${escapeHtml(council.Address1 ?? "")}<br />
${escapeHtml(council.Zip1 ?? "")} ${escapeHtml(council.City1 ?? "")}<br />
<br />
${council.btwNummer ? `BTW nr ${escapeHtml(council.btwNummer)}` : ""}
${council.kvkNummer ? `<br />
KVK ${escapeHtml(council.kvkNummer)}` : ""}`
    : "VeiligStallen";
  return `<!DOCTYPE HTML PUBLIC "-//W3C//DTD HTML 4.01 Transitional//EN" "http://www.w3.org/TR/html4/loose.dtd">
<html>
<head>
<title>VeiligStallen.nl</title>
<meta http-equiv="Content-Type" content="text/html; charset=utf-8">
<style type="text/css">
body { width: 90%; font-family: Arial, Helvetica, sans-serif; background-color: #fff; font-size: 12px; }
h1 { font-size: 130%; }
h2 { font-size: 120%; }
h3 { font-size: 110%; }
h1, h2, h3 { font-weight: 600; letter-spacing: .1em; padding-top: 10px; margin: 0px; }
.small { font-size: .7em; }
div.hr { border-top: 1px solid #999; margin-top: 10px; margin-bottom: 10px; font-size: 1px; line-height: 1px; height: 1px; }
#content { width: 100%; font-size: 1em; }
#footer { font-size: .7em; color: #777; }
a {font-weight: bold;}
${theme ? `h1, h2, h3, h4, h5, h6 { color: #${theme}; }
a:link, a:visited { color: #${theme}; }` : ""}
</style>
</head>
<body>
<p><img src="${mailLogo(council?.CompanyLogo)}" align="absmiddle"></p>
<div class="hr"></div>
<div id="content">
<p>${greeting}</p>
${message}
<p>
Met vriendelijke groet,<br />
${signature}
</p>
</div>
<div class="hr"></div>
<div id="footer">
Dit is een automatisch gegenereerde e-mail. Reageer niet op dit bericht.
Voor vragen kunt u terecht op de website <a href="http://www.veiligstallen.nl">veiligstallen.nl</a>.
</div>
</body>
</html>`;
}

// MailController.sendEmailToAccount: to the account, or to cc when the account has no address.
export async function sendAccountMail(input: {
  account: MailAccount;
  councilId?: string | null;
  subject: string;
  message: string;
  cc?: string | null;
}): Promise<void> {
  const to = input.account.Email?.includes("@") ? input.account.Email : null;
  const cc = input.cc?.includes("@") ? input.cc : null;
  if (!to && !cc) return;
  const html = await accountMailLayout(input.account, input.councilId, input.message);
  await sendCitizenMail({ to: (to ?? cc)!, cc: to ? cc : null, subject: input.subject, html });
}
