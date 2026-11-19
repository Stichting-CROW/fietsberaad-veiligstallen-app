import assert from "node:assert/strict";
import test from "node:test";
import {
  formatInfoDateTime,
  includeKmlPlacemark,
  infoFilesRefreshPaused,
  kmlStallingUrl,
  renderInfoFiles,
  voorzieningen,
  xmlStallingUrl,
  type InfoStalling,
} from "./render";

const noon = new Date("2026-10-21T10:00:00Z");

function clock(hour: number, minute: number): Date {
  return new Date(Date.UTC(1970, 0, 1, hour, minute, 0));
}

function stalling(overrides: Partial<InfoStalling> = {}): InfoStalling {
  const hours = {
    su: { open: null, close: null },
    mo: { open: clock(8, 0), close: clock(18, 0) },
    tu: { open: clock(0, 0), close: clock(23, 59) },
    we: { open: clock(0, 0), close: clock(0, 0) },
    th: { open: null, close: null },
    fr: { open: clock(9, 30), close: clock(17, 0) },
    sa: { open: clock(10, 0), close: clock(16, 0) },
  };
  return {
    stallingsId: "2600_066",
    title: "Turfmarkt",
    description: "Onder het plein",
    location: "Turfmarkt 1",
    postcode: "2511AA",
    plaats: "Den Haag",
    type: "bewaakt",
    urlName: "denhaag",
    companyName: "Den Haag",
    coordinates: "52.07,4.31",
    capacityColumn: 119,
    capaciteitSum: 40,
    capaciteitFiets: 30,
    capaciteitBromfiets: 0,
    capaciteitSpeciale: 4,
    capaciteitElektrisch: 6,
    capaciteitMotor: 0,
    verwijssysteem: true,
    occupation: 12,
    fms: true,
    exploitant: "Exploitant BV",
    tariefcode: 1,
    tariefOmschrijving: "eerste uur vrij",
    toegangscontrole: 1,
    beheerder: "Beheer",
    beheerderContact: "020-1",
    services: "Camera,Camera,Toilet",
    extraServices: "Pomp",
    openingstijden: "Feestdagen gesloten",
    isStationsstalling: false,
    hasOpeningExceptions: false,
    dayHours: hours,
    exceptions: [],
    sections: [
      { externalId: "2600_066_1", titel: "Hal", capaciteit: 100, bezetting: 95, bulk: 10 },
    ],
    subscriptions: [{ naam: "Maand", prijs: "12.50" }],
    ...overrides,
  };
}

test("KML keeps an empty coordinate and drops a part above 180", () => {
  assert.equal(includeKmlPlacemark(""), true);
  assert.equal(includeKmlPlacemark("52.07,4.31"), true);
  assert.equal(includeKmlPlacemark("200,4.31"), false);
  assert.equal(includeKmlPlacemark("52,181"), false);
});

test("stalling URLs follow the ColdFusion paths", () => {
  assert.equal(kmlStallingUrl(stalling()), "http://www.veiligstallen.nl/denhaag/stallingen/2600_066#2600_066");
  assert.equal(xmlStallingUrl(stalling()), "http://www.veiligstallen.nl/denhaag/stallingen/2600_066");
  assert.equal(kmlStallingUrl(stalling({ type: "fietskluizen" })), "http://www.veiligstallen.nl/denhaag/fietskluizen/2600_066");
  assert.equal(kmlStallingUrl(stalling({ type: "fietstrommel" })), "http://www.veiligstallen.nl/denhaag/fietstrommels/2600_066");
  assert.equal(kmlStallingUrl(stalling({ type: "buurtstalling" })), "http://www.veiligstallen.nl/denhaag/buurtstallingen/2600_066");
  assert.equal(xmlStallingUrl(stalling({ type: "buurtstalling" })), "http://www.veiligstallen.nl/denhaag/stallingen/2600_066");
});

test("services drop duplicates and keep extra services", () => {
  assert.equal(voorzieningen(stalling()), "Camera,Toilet,Pomp");
  assert.equal(voorzieningen(stalling({ services: "", extraServices: "Pomp" })), ",Pomp");
});

test("KML capacity text uses the stalling column and an empty total", () => {
  const { kml } = renderInfoFiles([stalling()], noon);
  assert.match(kml, /Fietsen: 119\nTotaal: /);
  assert.match(kml, /http:\/\/www\.veiligstallen\.nl\/resources\/images\/kml\/bewaakt_small\.png/);
  assert.match(kml, /<coordinates>4\.31,52\.07,0<\/coordinates>/);
  assert.match(kml, /Bezet: 12/);
  assert.match(kml, /Realtime info: http:\/\/verwijssysteem\.veiligstallen\.nl\/Den Haag\/2600_066/);
  assert.match(kml, /eerste uur vrij betaald \(zie voor details: http:\/\/www\.veiligstallen\.nl\/denhaag\/stallingen\/2600_066#2600_066\)/);
  assert.match(kml, /Wo: Gehele dag gesloten\r\n/);
  assert.match(kml, /Do: Onbekend\r\n/);
  assert.match(kml, /Di: Gehele dag geopend\r\n/);
  assert.match(kml, /Ma: 08:00 - 18:00\r\n/);
  assert.match(kml, /Feestdagen gesloten/);
  assert.match(kml, /Selfservice/);
  assert.match(kml, /Exploitant BV/);
  assert.doesNotMatch(kml, /BeheerderContact/);
  assert.doesNotMatch(kml, /<\?xml/);
});

test("a fietskluis omits opening hours and services, and names the stalling manager", () => {
  const { kml, xml } = renderInfoFiles(
    [stalling({ type: "fietskluizen", fms: false, verwijssysteem: false, description: "" })],
    noon
  );
  assert.doesNotMatch(kml, /Openingstijden/);
  assert.doesNotMatch(kml, /Voorzieningen/);
  assert.match(kml, /Beheer/);
  assert.match(kml, /020-1/);
  assert.match(kml, /<value>Onbekend<\/value>/);
  assert.doesNotMatch(xml, /<Omschrijving>/);
  assert.doesNotMatch(xml, /<Openingstijden>/);
  assert.doesNotMatch(xml, /<CapaciteitFiets>/);
  assert.match(xml, /<CapaciteitTotaal>40<\/CapaciteitTotaal>/);
});

test("XML sections subtract an active bulk hold and floor free places at 0", () => {
  const { xml } = renderInfoFiles([stalling()], noon);
  assert.match(xml, /<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.match(xml, /<CapaciteitFiets>30<\/CapaciteitFiets>/);
  assert.doesNotMatch(xml, /<CapaciteitBromfiets>/);
  assert.match(xml, /<CapaciteitEFiets>6<\/CapaciteitEFiets>/);
  assert.match(xml, /<Capaciteit>90<\/Capaciteit>/);
  assert.match(xml, /<Vrij>0<\/Vrij>/);
  assert.match(xml, /<Bezet>95<\/Bezet>/);
  assert.match(xml, /<Naam><!\[CDATA\[Maand\]\]><\/Naam>/);
  assert.match(xml, /<Prijs>12\.50<\/Prijs>/);
  assert.match(xml, /abonnement\?stalling=2600_066/);
  assert.match(xml, /<Wo>\s*<Opmerking>Gehele dag gesloten<\/Opmerking>\s*<\/Wo>/);
  assert.match(xml, /<Ma>\s*<Open>08:00<\/Open><Dicht>18:00<\/Dicht>\s*<\/Ma>/);
});

test("a zero bulk hold is not subtracted and a zero total capacity is Onbekend", () => {
  const { xml } = renderInfoFiles(
    [
      stalling({
        capaciteitSum: 0,
        capaciteitFiets: 0,
        capaciteitSpeciale: 0,
        capaciteitElektrisch: 0,
        sections: [{ externalId: "1", titel: "Hal", capaciteit: 10, bezetting: 1, bulk: 0 }],
        subscriptions: [],
        verwijssysteem: true,
      }),
    ],
    noon
  );
  assert.match(xml, /<CapaciteitTotaal>Onbekend<\/CapaciteitTotaal>/);
  assert.match(xml, /<Capaciteit>10<\/Capaciteit>/);
  assert.doesNotMatch(xml, /<Abonnementen>/);
});

test("an opening exception replaces that weekday", () => {
  const { kml } = renderInfoFiles(
    [
      stalling({
        hasOpeningExceptions: true,
        exceptions: [{ opening: new Date("2026-10-21T09:00:00Z"), closing: new Date("2026-10-21T17:00:00Z") }],
      }),
    ],
    noon
  );
  assert.match(kml, /Wo: 09:00 - 17:00\r\n/);
});

test("the writer pauses during Amsterdam hours 3 and 4", () => {
  assert.equal(infoFilesRefreshPaused(new Date("2026-10-21T01:30:00Z")), true);
  assert.equal(infoFilesRefreshPaused(new Date("2026-10-21T02:30:00Z")), true);
  assert.equal(infoFilesRefreshPaused(new Date("2026-10-21T03:30:00Z")), false);
  assert.equal(infoFilesRefreshPaused(new Date("2026-01-15T02:30:00Z")), true);
  assert.equal(infoFilesRefreshPaused(new Date("2026-01-15T04:30:00Z")), false);
});

test("DateTime uses an unpadded Amsterdam hour", () => {
  assert.equal(formatInfoDateTime(new Date("2026-10-21T07:05:03Z")), "2026-10-21 9:05:03");
});
