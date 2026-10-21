export const DOCUMENT_PLACEHOLDERS = [
  "{account.voornaam}",
  "{account.tussenvoegsels}",
  "{account.achternaam}",
  "{account.naam}",
  "{account.adres}",
  "{account.postcode}",
  "{account.plaats}",
  "{account.email}",
  "{account.telefoon}",
  "{stalling.naam}",
  "{stalling.type}",
  "{abonnement.type}",
  "{abonnement.prijs}",
  "{plek.nummer}",
  "{datum}",
] as const;

export type DocumentContext = {
  firstName?: string | null;
  middleName?: string | null;
  lastName?: string | null;
  address?: string | null;
  addressNr?: string | null;
  zip?: string | null;
  city?: string | null;
  email?: string | null;
  phone?: string | null;
  stallingTitle?: string | null;
  stallingType?: string | null;
  subscriptionName?: string | null;
  subscriptionPrice?: string | null;
  placeTitle?: string | null;
  dateLabel: string;
};

/** Phone line from ColdFusion BikeparkAccount.getDisplayPhone. */
export function displayPhone(phone: string | null | undefined, mobile: string | null | undefined): string {
  const fixed = phone?.trim() ?? "";
  const cell = mobile?.trim() ?? "";
  if (fixed && cell) return `${fixed} / ${cell}`;
  return fixed || cell;
}

function text(value: string | null | undefined): string {
  return value?.trim() ? value : "";
}

const FALLBACK_LOGO = "https://fms.veiligstallen.nl/resources/client/logo.png";
const LIBRARY_LOGO = "https://static.veiligstallen.nl/library/logo/";

/** Same paths as the beheer header: a full URL, or a file name under the static logo library. */
export function logoUrl(file: string | null | undefined): string {
  const value = file?.trim();
  if (!value) return FALLBACK_LOGO;
  if (value.startsWith("[local]")) return value.replace("[local]", "/api");
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/")) return value;
  return LIBRARY_LOGO + value.replace(/^\/+/, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Printable page used by contract.cfm and machtiging.cfm: centered logo, then the filled template. */
export function documentPage(input: { title: string; body: string; logoUrl: string; logoAlt: string }): string {
  return `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(input.title)}</title><style>body{font-family:Arial,Helvetica,sans-serif;font-size:9pt;background:#ccc;margin:0} .sheet{width:20cm;margin:1rem auto;padding:1.5cm;background:#fff} .logo{text-align:center} @media print{body{background:#fff} .sheet{margin:0;width:auto}}</style></head><body><div class="sheet"><div class="logo"><img src="${escapeHtml(input.logoUrl)}" alt="${escapeHtml(input.logoAlt)}" onerror="this.onerror=null;this.src='${FALLBACK_LOGO}'"></div><br><br>${input.body}</div></body></html>`;
}

/** Same replacements as ColdFusion Documenttemplate.render. */
export function renderDocument(html: string, context: DocumentContext): string {
  const fullName = [context.firstName, context.middleName, context.lastName].filter((part) => part?.trim()).join(" ");
  const address = [context.address, context.addressNr].filter((part) => part?.trim()).join(" ");
  const replacements: Record<string, string> = {
    "{account.voornaam}": text(context.firstName),
    "{account.tussenvoegsels}": text(context.middleName),
    "{account.achternaam}": text(context.lastName),
    "{account.naam}": fullName,
    "{account.adres}": address,
    "{account.postcode}": text(context.zip),
    "{account.plaats}": text(context.city),
    "{account.email}": text(context.email),
    "{account.telefoon}": text(context.phone),
    "{stalling.naam}": text(context.stallingTitle),
    "{stalling.type}": text(context.stallingType),
    "{abonnement.type}": text(context.subscriptionName) || " ",
    "{abonnement.prijs}": text(context.subscriptionPrice) || " ",
    "{plek.nummer}": text(context.placeTitle),
    "{datum}": context.dateLabel,
  };
  let content = html;
  for (const [token, value] of Object.entries(replacements)) {
    content = content.split(token).join(value);
  }
  return content.replace(/ {2,}/g, " ");
}
