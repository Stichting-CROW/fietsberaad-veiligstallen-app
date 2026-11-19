/**
 * ColdFusion fietsenstalling_kml.generateKmlFile and generateXmlFile.
 * The seven /kml/{type}.kml files are not part of this writer.
 */

export const INFO_SITE = "http://www.veiligstallen.nl";
export const INFO_VERWIJS = "http://verwijssysteem.veiligstallen.nl";

const DAY_LABELS = ["", "Zo", "Ma", "Di", "Wo", "Do", "Vr", "Za"] as const;
const DAY_CODES = ["", "su", "mo", "tu", "we", "th", "fr", "sa"] as const;

const WEEKDAY_TO_CF: Record<string, number> = {
  Sun: 1,
  Mon: 2,
  Tue: 3,
  Wed: 4,
  Thu: 5,
  Fri: 6,
  Sat: 7,
};

export type Clock = { open: Date | null; close: Date | null };

export type InfoSection = {
  externalId: string;
  titel: string;
  capaciteit: number;
  bezetting: number;
  /** Null or 0 means ColdFusion's empty bulk column: do not subtract. */
  bulk: number | null;
};

export type InfoSubscription = { naam: string; prijs: string };

export type InfoException = { opening: Date; closing: Date };

export type InfoStalling = {
  stallingsId: string;
  title: string;
  description: string;
  location: string;
  postcode: string;
  plaats: string;
  type: string;
  urlName: string;
  companyName: string;
  coordinates: string;
  /** fietsenstallingen.Capacity, used in the KML capacity text. */
  capacityColumn: number;
  capaciteitSum: number;
  capaciteitFiets: number;
  capaciteitBromfiets: number;
  capaciteitSpeciale: number;
  capaciteitElektrisch: number;
  capaciteitMotor: number;
  verwijssysteem: boolean;
  /** Sum of section Bezetting. Null when the stalling has no sections. */
  occupation: number | null;
  fms: boolean;
  exploitant: string;
  tariefcode: number | null;
  tariefOmschrijving: string;
  toegangscontrole: number | null;
  beheerder: string;
  beheerderContact: string;
  services: string;
  extraServices: string;
  openingstijden: string;
  isStationsstalling: boolean;
  hasOpeningExceptions: boolean;
  dayHours: Record<string, Clock>;
  exceptions: InfoException[];
  sections: InfoSection[];
  subscriptions: InfoSubscription[];
};

export function infoFilesRefreshPaused(now: Date): boolean {
  const hour = Number(amsterdamPart(now, "hour"));
  return hour === 3 || hour === 4;
}

export function formatInfoDateTime(now: Date): string {
  const year = amsterdamPart(now, "year");
  const month = amsterdamPart(now, "month");
  const day = amsterdamPart(now, "day");
  const hour = String(Number(amsterdamPart(now, "hour")));
  const minute = amsterdamPart(now, "minute");
  const second = amsterdamPart(now, "second");
  return `${year}-${month}-${day} ${hour}:${minute}:${second}`;
}

/** ColdFusion numeric compare: an empty or non-numeric token is 0, and 0 <= 180. */
export function includeKmlPlacemark(coordinates: string): boolean {
  const parts = coordinates.split(",");
  const lat = cfNumber(parts[0] ?? "");
  const lng = cfNumber(parts.length > 1 ? (parts[parts.length - 1] ?? "") : (parts[0] ?? ""));
  return lat <= 180 && lng <= 180;
}

export function kmlStallingUrl(stalling: Pick<InfoStalling, "type" | "urlName" | "stallingsId">): string {
  const id = stalling.stallingsId;
  const base = `${INFO_SITE}/${stalling.urlName}`;
  if (stalling.type === "fietskluizen") return `${base}/fietskluizen/${id}`;
  if (stalling.type === "fietstrommel") return `${base}/fietstrommels/${id}`;
  if (stalling.type === "buurtstalling") return `${base}/buurtstallingen/${id}`;
  return `${base}/stallingen/${id}#${id}`;
}

export function xmlStallingUrl(stalling: Pick<InfoStalling, "type" | "urlName" | "stallingsId">): string {
  const id = stalling.stallingsId;
  const base = `${INFO_SITE}/${stalling.urlName}`;
  if (stalling.type === "fietskluizen") return `${base}/fietskluizen/${id}`;
  return `${base}/stallingen/${id}`;
}

export function dedupeList(raw: string): string {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw.split(",")) {
    if (seen.has(item)) continue;
    seen.add(item);
    out.push(item);
  }
  return out.join(",");
}

export function voorzieningen(stalling: Pick<InfoStalling, "services" | "extraServices">): string {
  const services = dedupeList(stalling.services);
  if (stalling.extraServices.length > 0) return `${services},${stalling.extraServices}`;
  return services;
}

export function renderInfoFiles(stallingen: InfoStalling[], now: Date): { kml: string; xml: string } {
  return { kml: renderKml(stallingen, now), xml: renderXml(stallingen, now) };
}

function renderKml(stallingen: InfoStalling[], now: Date): string {
  const placemarks = stallingen.filter((stalling) => includeKmlPlacemark(stalling.coordinates)).map((stalling) => renderPlacemark(stalling, now));
  return `<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2">
<Document>
<DateTime>${formatInfoDateTime(now)}</DateTime>
<Name>fietsenstallingen VeiligStallen</Name>
<Description>fietsenstallingen</Description>
${kmlStyles()}
${placemarks.join("\n")}
</Document>
</kml>
`;
}

function renderXml(stallingen: InfoStalling[], now: Date): string {
  const bodies = stallingen.map((stalling) => renderXmlStalling(stalling, now));
  return `<?xml version="1.0" encoding="UTF-8"?>
<Fietsenstallingen>
<DateTime>${formatInfoDateTime(now)}</DateTime>
${bodies.join("\n")}
</Fietsenstallingen>
`;
}

function renderPlacemark(stalling: InfoStalling, now: Date): string {
  const url = kmlStallingUrl(stalling);
  const [lng, lat] = coordinatePair(stalling.coordinates);
  const lines: string[] = [
    "<Placemark>",
    `<name>${cdata(stalling.title)}</name>`,
    "<ExtendedData>",
    dataValue("Type", stalling.type),
    dataCdata("Omschrijving", stalling.description),
    dataCdata("Adres", stalling.location),
    dataCdata("Postcode", stalling.postcode),
    dataCdata("Plaats", stalling.plaats),
    dataValue("Url", url),
    dataCdata("Capaciteit", kmlCapacity(stalling)),
  ];
  if (stalling.verwijssysteem) {
    const bezet = stalling.occupation == null ? "" : String(stalling.occupation);
    lines.push(dataCdata("Bezetting", `Bezet: ${bezet}\nRealtime info: ${INFO_VERWIJS}/${stalling.companyName}/${stalling.stallingsId}`));
  } else {
    lines.push(dataValue("Bezetting", "Onbekend"));
  }
  const tarief = `${stalling.tariefOmschrijving} ${tariefCode(stalling.tariefcode)}`;
  const tariefDetails = stalling.fms ? ` (zie voor details: ${url})` : "";
  lines.push(dataCdata("Tarieven", `${tarief}${tariefDetails}`));
  if (stalling.type !== "fietskluizen") {
    lines.push(dataCdata("Openingstijden", openingText(stalling, now)));
  }
  lines.push(dataValue("Stationsstalling", stalling.isStationsstalling ? "Ja" : "Nee"));
  if (stalling.type !== "fietskluizen") {
    lines.push(dataCdata("Voorzieningen", voorzieningen(stalling)));
  }
  lines.push(dataValue("Toegangscontrole", toegangscontroleText(stalling.toegangscontrole)));
  lines.push(...beheerderElements(stalling, "kml"));
  lines.push("</ExtendedData>", `<styleUrl>#${stalling.type}</styleUrl>`, "<Point>", `<coordinates>${lng},${lat},0</coordinates>`, "</Point>", "</Placemark>");
  return lines.join("\n");
}

function renderXmlStalling(stalling: InfoStalling, now: Date): string {
  const lines: string[] = ["<Fietsenstalling>", `<Naam>${cdata(stalling.title)}</Naam>`];
  if (stalling.description.length > 0) lines.push(`<Omschrijving>${cdata(stalling.description)}</Omschrijving>`);
  lines.push(`<ID>${xmlText(stalling.stallingsId)}</ID>`, `<Gemeente>${cdata(stalling.companyName)}</Gemeente>`, `<Straat>${cdata(stalling.location)}</Straat>`, `<Postcode>${cdata(stalling.postcode)}</Postcode>`, `<Plaats>${cdata(stalling.plaats)}</Plaats>`, `<Url>${xmlText(xmlStallingUrl(stalling))}</Url>`);
  if (stalling.type !== "fietskluizen") {
    pushCapacity(lines, "CapaciteitFiets", stalling.capaciteitFiets);
    pushCapacity(lines, "CapaciteitBromfiets", stalling.capaciteitBromfiets);
    pushCapacity(lines, "CapaciteitSpecialeFiets", stalling.capaciteitSpeciale);
    pushCapacity(lines, "CapaciteitEFiets", stalling.capaciteitElektrisch);
    pushCapacity(lines, "CapaciteitMotorfiets", stalling.capaciteitMotor);
  }
  lines.push(stalling.capaciteitSum !== 0 ? `<CapaciteitTotaal>${stalling.capaciteitSum}</CapaciteitTotaal>` : "<CapaciteitTotaal>Onbekend</CapaciteitTotaal>");
  if (stalling.verwijssysteem) {
    lines.push("<Secties>");
    for (const section of stalling.sections) {
      const capacity = sectionCapacity(section);
      const vrij = Math.max(capacity - section.bezetting, 0);
      lines.push("<Sectie>", `<ID>${xmlText(section.externalId)}</ID>`, `<Naam>${cdata(section.titel)}</Naam>`, `<Capaciteit>${capacity}</Capaciteit>`, `<Vrij>${vrij}</Vrij>`, `<Bezet>${section.bezetting}</Bezet>`, "</Sectie>");
    }
    lines.push("</Secties>", `<Verwijssysteem>${INFO_VERWIJS}/${xmlText(stalling.companyName)}/${xmlText(stalling.stallingsId)}</Verwijssysteem>`);
  }
  if (stalling.type !== "fietskluizen") {
    lines.push("<Openingstijden>");
    for (const day of weekDays(stalling, now)) {
      lines.push(`<${day.label}>`, openingXmlInner(day.clock), `</${day.label}>`);
    }
    lines.push("</Openingstijden>");
  }
  lines.push(`<Stationsstalling>${stalling.isStationsstalling ? "Ja" : "Nee"}</Stationsstalling>`);
  if (stalling.type !== "fietskluizen") lines.push(`<Voorzieningen>${cdata(voorzieningen(stalling))}</Voorzieningen>`);
  lines.push(`<Type>${xmlText(stalling.type)}</Type>`);
  if (stalling.coordinates.length > 0) {
    const [lng, lat] = coordinatePair(stalling.coordinates);
    lines.push(`<Coordinaten>${lng},${lat}</Coordinaten>`);
  }
  if (stalling.toegangscontrole != null && stalling.toegangscontrole !== 0) {
    lines.push("<Toegangscontrole>", toegangscontroleText(stalling.toegangscontrole), "</Toegangscontrole>");
  }
  lines.push(...beheerderElements(stalling, "xml"));
  if (stalling.subscriptions.length > 0) {
    lines.push("<Abonnementen>");
    for (const subscription of stalling.subscriptions) {
      lines.push("<Abonnement>", `<Naam>${cdata(subscription.naam)}</Naam>`, `<Prijs>${xmlText(subscription.prijs)}</Prijs>`, "</Abonnement>");
    }
    lines.push(`<AbonnementURL>${INFO_SITE}/${xmlText(stalling.urlName)}/abonnement?stalling=${xmlText(stalling.stallingsId)}</AbonnementURL>`, "</Abonnementen>");
  }
  lines.push("</Fietsenstalling>");
  return lines.join("\n");
}

function kmlCapacity(stalling: InfoStalling): string {
  return `Fietsen: ${stalling.capacityColumn}\nTotaal: `;
}

function openingText(stalling: InfoStalling, now: Date): string {
  const lines = weekDays(stalling, now).map((day) => `${day.label}: ${openingLabel(day.clock)}`);
  let text = lines.join("\r\n") + "\r\n";
  if (stalling.openingstijden.length > 0) text += stalling.openingstijden;
  return text;
}

function openingXmlInner(clock: Clock): string {
  if (isOpenAllDay(clock)) return "<Opmerking>Gehele dag geopend</Opmerking>";
  if (isClosedAllDay(clock)) return "<Opmerking>Gehele dag gesloten</Opmerking>";
  if (isUnknown(clock)) return "<Opmerking>Onbekend</Opmerking>";
  const parts: string[] = [];
  if (clock.open) parts.push(`<Open>${hhmm(clock.open)}</Open>`);
  if (clock.close) parts.push(`<Dicht>${hhmm(clock.close)}</Dicht>`);
  return parts.join("");
}

function openingLabel(clock: Clock): string {
  if (isOpenAllDay(clock)) return "Gehele dag geopend";
  if (isClosedAllDay(clock)) return "Gehele dag gesloten";
  if (isUnknown(clock)) return "Onbekend";
  let text = "";
  if (clock.open) text += hhmm(clock.open);
  if (clock.close) text += ` - ${hhmm(clock.close)}`;
  return text;
}

export function weekDays(stalling: InfoStalling, now: Date): { label: string; clock: Clock }[] {
  const start = cfDayOfWeek(now);
  const days: { label: string; clock: Clock }[] = [];
  for (let index = start; index <= start + 6; index++) {
    let dagnummer = index % 7;
    if (dagnummer === 0) dagnummer = 7;
    const label = DAY_LABELS[dagnummer] ?? "Zo";
    const daycode = DAY_CODES[dagnummer] ?? "su";
    days.push({ label, clock: clockForDay(stalling, daycode, now) });
  }
  return days;
}

function clockForDay(stalling: InfoStalling, daycode: string, now: Date): Clock {
  const stored = stalling.dayHours[daycode] ?? { open: null, close: null };
  if (!stalling.hasOpeningExceptions) return stored;
  const date = nextCalendarDate(cfDayFromCode(daycode), now);
  const exception = stalling.exceptions.find((item) => amsterdamDate(item.opening) === date);
  if (!exception) return stored;
  return { open: exception.opening, close: exception.closing };
}

function sectionCapacity(section: InfoSection): number {
  if (section.bulk == null || section.bulk === 0) return section.capaciteit;
  return section.capaciteit - section.bulk;
}

function beheerderElements(stalling: InfoStalling, kind: "kml" | "xml"): string[] {
  if (stalling.fms && stalling.exploitant.length > 0) {
    return kind === "kml" ? [dataCdata("Beheerder", stalling.exploitant)] : [`<Beheerder>${cdata(stalling.exploitant)}</Beheerder>`];
  }
  if (kind === "kml") {
    return [dataCdata("Beheerder", stalling.beheerder), dataCdata("BeheerderContact", stalling.beheerderContact)];
  }
  return [`<Beheerder>${cdata(stalling.beheerder)}</Beheerder>`, `<BeheerderContact>${cdata(stalling.beheerderContact)}</BeheerderContact>`];
}

function pushCapacity(lines: string[], name: string, value: number): void {
  if (value !== 0) lines.push(`<${name}>${value}</${name}>`);
}

function tariefCode(code: number | null): string {
  switch (code) {
    case 1:
      return "betaald";
    case 2:
      return "gratis";
    case 3:
      return "weekend gratis";
    case 4:
      return "overdag gratis";
    case 5:
      return "eerste dag gratis";
    default:
      return "";
  }
}

function toegangscontroleText(code: number | null): string {
  if (code === 1) return "Selfservice";
  if (code === 2) return "Deels selfservice";
  return "";
}

function kmlStyles(): string {
  const types = ["bewaakt", "toezicht", "geautomatiseerd", "onbewaakt", "fietskluizen", "buurtstalling", "fietstrommel"];
  return types
    .map(
      (type) => `<Style id="${type}">
<IconStyle>
<Icon><href>${INFO_SITE}/resources/images/kml/${type}_small.png</href></Icon>
</IconStyle>
</Style>`
    )
    .join("\n");
}

function dataValue(name: string, value: string): string {
  return `<Data name="${name}"><value>${xmlText(value)}</value></Data>`;
}

function dataCdata(name: string, value: string): string {
  return `<Data name="${name}"><value>${cdata(value)}</value></Data>`;
}

function cdata(value: string): string {
  return `<![CDATA[${value.replaceAll("]]>", "]]]]><![CDATA[>")}]]>`;
}

function xmlText(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}

function coordinatePair(coordinates: string): [string, string] {
  const parts = coordinates.split(",");
  const lat = (parts[0] ?? "").trim();
  const lng = (parts.length > 1 ? (parts[parts.length - 1] ?? "") : lat).trim();
  return [lng, lat];
}

function cfNumber(value: string): number {
  const trimmed = value.trim();
  if (trimmed === "") return 0;
  const parsed = Number(trimmed);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isOpenAllDay(clock: Clock): boolean {
  return Boolean(clock.open && clock.close && hours(clock.open) === 0 && minutes(clock.open) === 0 && hours(clock.close) === 23 && minutes(clock.close) === 59);
}

function isClosedAllDay(clock: Clock): boolean {
  return Boolean(clock.open && clock.close && hours(clock.open) === 0 && minutes(clock.open) === 0 && hours(clock.close) === 0 && minutes(clock.close) === 0);
}

function isUnknown(clock: Clock): boolean {
  return clock.open == null && clock.close == null;
}

function hhmm(value: Date): string {
  return `${String(hours(value)).padStart(2, "0")}:${String(minutes(value)).padStart(2, "0")}`;
}

function hours(value: Date): number {
  return value.getUTCHours();
}

function minutes(value: Date): number {
  return value.getUTCMinutes();
}

function cfDayOfWeek(now: Date): number {
  const weekday = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Amsterdam", weekday: "short" }).format(now);
  return WEEKDAY_TO_CF[weekday] ?? 1;
}

function cfDayFromCode(daycode: string): number {
  const index = DAY_CODES.indexOf(daycode as (typeof DAY_CODES)[number]);
  return index > 0 ? index : 1;
}

function nextCalendarDate(dayOfWeek: number, now: Date): string {
  const today = cfDayOfWeek(now);
  const add = (7 + dayOfWeek - today) % 7;
  const [year, month, day] = amsterdamDate(now).split("-").map(Number);
  const noon = new Date(Date.UTC(year ?? 1970, (month ?? 1) - 1, (day ?? 1) + add, 12, 0, 0));
  return amsterdamDate(noon);
}

function amsterdamDate(now: Date): string {
  return `${amsterdamPart(now, "year")}-${amsterdamPart(now, "month")}-${amsterdamPart(now, "day")}`;
}

function amsterdamPart(now: Date, type: "year" | "month" | "day" | "hour" | "minute" | "second"): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Amsterdam",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(now);
  return parts.find((part) => part.type === type)?.value ?? "00";
}
