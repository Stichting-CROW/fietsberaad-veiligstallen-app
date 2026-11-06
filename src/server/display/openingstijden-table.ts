import type { fietsenstallingen } from "~/generated/prisma-client";

const DAY_NAMES = ["", "Maandag", "Dinsdag", "Woensdag", "Donderdag", "Vrijdag", "Zaterdag", "Zondag"];

type ParkingHours = Pick<
  fietsenstallingen,
  | "Open_ma"
  | "Dicht_ma"
  | "Open_di"
  | "Dicht_di"
  | "Open_wo"
  | "Dicht_wo"
  | "Open_do"
  | "Dicht_do"
  | "Open_vr"
  | "Dicht_vr"
  | "Open_za"
  | "Dicht_za"
  | "Open_zo"
  | "Dicht_zo"
>;

const DAY_KEYS: (keyof ParkingHours)[][] = [
  ["Open_zo", "Dicht_zo"],
  ["Open_ma", "Dicht_ma"],
  ["Open_di", "Dicht_di"],
  ["Open_wo", "Dicht_wo"],
  ["Open_do", "Dicht_do"],
  ["Open_vr", "Dicht_vr"],
  ["Open_za", "Dicht_za"],
];

function hhmm(d: Date | null): string {
  if (!d) return "0:00";
  return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

function isUnknown(open: Date | null, close: Date | null): boolean {
  return open == null || close == null;
}

function isOpenAllDay(open: Date | null, close: Date | null): boolean {
  return hhmm(open) === "0:00" && (hhmm(close) === "23:59" || hhmm(close) === "0:00");
}

function isClosedAllDay(open: Date | null, close: Date | null): boolean {
  return hhmm(open) === "0:00" && hhmm(close) === "0:00";
}

export function renderOpeningstijdenTableHtml(parking: ParkingHours, now = new Date()): string {
  const jsDow = now.getDay();
  const startDow = jsDow === 0 ? 7 : jsDow;
  let html = '<table width="500" cellpadding="0" cellspacing="0" border="0">';
  for (let i = 0; i < 7; i++) {
    const dagnummer = ((startDow - 1 + i) % 7) + 1;
    const [openKey, closeKey] = DAY_KEYS[dagnummer - 1]!;
    const open = parking[openKey] as Date | null;
    const close = parking[closeKey] as Date | null;
    html += '<tr class="openingsuren_dag">';
    html += `<td class="dag">${DAY_NAMES[dagnummer]}</td>`;
    if (isUnknown(open, close)) {
      html += '<td colspan="4">Onbekend</td>';
    } else if (isOpenAllDay(open, close)) {
      html += '<td colspan="3">Gehele dag geopend</td>';
    } else if (isClosedAllDay(open, close)) {
      html += '<td colspan="3">Gesloten</td>';
    } else {
      let closeStr = hhmm(close);
      if (closeStr === "0:00") closeStr = "24:00";
      html += `<td class="tijd open">${hhmm(open)}</td><td class="streepje">-</td><td class="tijd dicht">${closeStr}</td>`;
    }
    html += "</tr>";
  }
  html += "</table>";
  return html;
}
