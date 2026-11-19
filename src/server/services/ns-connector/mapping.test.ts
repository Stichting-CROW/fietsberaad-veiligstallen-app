import assert from "node:assert/strict";
import test from "node:test";
import type { NSLocation } from "~/types/ns-connector";
import {
  buildInfoTextFields,
  buildLocationAddress,
  buildLocationUpdateFields,
  buildOpeningHourFields,
  externalIdFromUri,
  nsInfoTextToHtml,
  nsOpeningHourToDbTimes,
  parseNsTime,
  resolveImageUri,
  typeMapping,
} from "./mapping";

function hhmm(d: Date | null | undefined): string {
  if (!d) return "null";
  return `${d.getUTCHours()}:${String(d.getUTCMinutes()).padStart(2, "0")}`;
}

test("typeMapping maps NS facility names", () => {
  assert.deepEqual(typeMapping("Bemenste fietsenstalling"), { bikeparkType: "bewaakt", prefix: "bwt" });
  assert.deepEqual(typeMapping("Zelfservice fietsenstalling"), { bikeparkType: "geautomatiseerd", prefix: "aut" });
  assert.deepEqual(typeMapping("Fietskluis"), { bikeparkType: "fietskluizen", prefix: "fkl" });
  assert.throws(() => typeMapping("Onbekend"), /Unknown type/);
});

test("externalIdFromUri", () => {
  assert.equal(externalIdFromUri("https://example/places/stationfacility-mp002", "aut"), "mp002");
  assert.equal(externalIdFromUri("https://example/places/stationfacility-42", "fkl"), "fkl-42");
  assert.equal(externalIdFromUri("prefix-mp002", "bwt"), "mp002");
  assert.equal(externalIdFromUri("https://example/places/stationfacility-Hbzm/Bzm001", "fkl"), "Bzm001");
});

test("parseNsTime returns UTC epoch time or null", () => {
  const t = parseNsTime("05:35");
  assert.ok(t);
  assert.equal(t!.getUTCHours(), 5);
  assert.equal(t!.getUTCMinutes(), 35);
  assert.equal(parseNsTime("bad"), null);
});

test("resolveImageUri requires infoImages", () => {
  assert.throws(() => resolveImageUri({ name: "x" } as NSLocation), /infoImages is missing/);
  assert.equal(resolveImageUri({ name: "x", infoImages: [] } as NSLocation), "");
  assert.equal(
    resolveImageUri({ name: "x", infoImages: [{ link: { uri: "https://img" }, name: "", title: "", body: "" }] } as NSLocation),
    "https://img",
  );
});

test("buildLocationUpdateFields regime and address", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const base: NSLocation = {
    name: "Test",
    stationCode: "TST",
    lat: 52.1,
    lng: 5.1,
    open: "Yes",
    link: { uri: "x-mp001" },
    infoImages: [],
    openingHours: [{ dayOfWeek: 1, startTime: "08:00", endTime: "18:00" }],
  };
  const map = typeMapping("Zelfservice fietsenstalling");

  const paid = buildLocationUpdateFields(
    { ...base, extra: { regime: "Betaald" }, street: "Straat", houseNumber: "1", postalCode: "1234AB" },
    map,
    now,
  );
  assert.equal(paid.Tariefcode, 1);
  assert.equal(paid.NotaVerwijssysteem, "Betaald");
  assert.equal(paid.Location, "Straat 1");
  assert.ok(paid.Open_ma);

  const gratis = buildLocationUpdateFields({ ...base, extra: { regime: "Gratis" } }, map, now);
  assert.equal(gratis.Tariefcode, undefined);
  assert.equal(gratis.NotaVerwijssysteem, "Gratis");

  const noRegime = buildLocationUpdateFields(base, map, now);
  assert.equal(noRegime.NotaVerwijssysteem, "");
});

test("buildLocationAddress variants", () => {
  assert.equal(buildLocationAddress({ street: "A", houseNumber: "2" } as NSLocation), "A 2");
  assert.equal(buildLocationAddress({ street: "A" } as NSLocation), "A");
  assert.equal(buildLocationAddress({} as NSLocation), "");
});

test("nsOpeningHourToDbTimes maps NS semantics to regular DB times", () => {
  const fullDay = nsOpeningHourToDbTimes({
    dayOfWeek: 1,
    startTime: "00:00",
    endTime: "24:00",
    closesNextDay: true,
  });
  assert.equal(hhmm(fullDay.open), "0:00");
  assert.equal(hhmm(fullDay.close), "23:59");

  const untilMidnight = nsOpeningHourToDbTimes({
    dayOfWeek: 5,
    startTime: "07:00",
    endTime: "24:00",
    closesNextDay: false,
  });
  assert.equal(hhmm(untilMidnight.open), "7:00");
  assert.equal(hhmm(untilMidnight.close), "0:00");

  const overnight = nsOpeningHourToDbTimes({
    dayOfWeek: 3,
    startTime: "05:20",
    endTime: "01:10",
    closesNextDay: true,
  });
  assert.equal(hhmm(overnight.open), "5:20");
  assert.equal(hhmm(overnight.close), "1:10");

  const sameDay = nsOpeningHourToDbTimes({
    dayOfWeek: 2,
    startTime: "08:00",
    endTime: "18:00",
    closesNextDay: false,
  });
  assert.equal(hhmm(sameDay.open), "8:00");
  assert.equal(hhmm(sameDay.close), "18:00");
});

test("nsInfoTextToHtml escapes and line breaks", () => {
  assert.equal(nsInfoTextToHtml("a & b\r\nc"), "a &amp; b<br />c");
  assert.equal(nsInfoTextToHtml("  "), "");
});

test("buildInfoTextFields maps Memo and Tarief Toelichting, ignores Storing", () => {
  const loc = {
    name: "x",
    stationCode: "X",
    lat: 0,
    lng: 0,
    open: "Yes",
    link: { uri: "u" },
    infoUrl: "https://www.ns.nl/fiets",
    infoImages: [
      { name: "m", title: "Memo", body: "Korte memo\r\n", link: { uri: "https://img/m.jpg" } },
      {
        name: "t",
        title: "Tarief Toelichting",
        body: "€ 1,40 per 24 uur.",
        link: { uri: "https://img/t.jpg" },
      },
      { name: "s", title: "Storing", body: "Gesloten wegens werk", link: { uri: "https://img/s.jpg" } },
    ],
  } as import("~/types/ns-connector").NSLocation;
  const fields = buildInfoTextFields(loc);
  assert.equal(fields.Url, "https://www.ns.nl/fiets");
  assert.equal(fields.Openingstijden, "Korte memo");
  assert.equal(fields.OmschrijvingTarieven, "€ 1,40 per 24 uur.");
});

test("buildLocationUpdateFields includes info text fields", () => {
  const now = new Date("2026-01-01T12:00:00Z");
  const base: import("~/types/ns-connector").NSLocation = {
    name: "Test",
    stationCode: "TST",
    lat: 52.1,
    lng: 5.1,
    open: "Yes",
    link: { uri: "x-mp001" },
    infoImages: [
      { name: "m", title: "Memo", body: "memo", link: { uri: "https://img" } },
      { name: "t", title: "Tarief Toelichting", body: "tarief", link: { uri: "https://img" } },
    ],
    infoUrl: "https://ns.nl/info",
    openingHours: [{ dayOfWeek: 1, startTime: "08:00", endTime: "18:00" }],
  };
  const map = typeMapping("Zelfservice fietsenstalling");
  const fields = buildLocationUpdateFields(base, map, now);
  assert.equal(fields.OmschrijvingTarieven, "tarief");
  assert.equal(fields.Openingstijden, "memo");
  assert.equal(fields.Url, "https://ns.nl/info");
});

test("buildOpeningHourFields clears all days when unknown or empty", () => {
  const unknown = buildOpeningHourFields({
    name: "x",
    stationCode: "X",
    lat: 0,
    lng: 0,
    open: "Unknown",
    link: { uri: "u" },
    openingHours: [],
  } as NSLocation);
  assert.equal(unknown.Open_ma, null);
  assert.equal(unknown.Dicht_zo, null);

  const withHours = buildOpeningHourFields({
    name: "x",
    stationCode: "X",
    lat: 0,
    lng: 0,
    open: "Yes",
    link: { uri: "u" },
    openingHours: [
      { dayOfWeek: 1, startTime: "00:00", endTime: "24:00", closesNextDay: true },
      { dayOfWeek: 2, startTime: "05:20", endTime: "01:10", closesNextDay: true },
    ],
  } as NSLocation);
  assert.equal(hhmm(withHours.Open_ma), "0:00");
  assert.equal(hhmm(withHours.Dicht_ma), "23:59");
  assert.equal(hhmm(withHours.Open_di), "5:20");
  assert.equal(hhmm(withHours.Dicht_di), "1:10");
  assert.equal(withHours.Open_wo, null);
  assert.equal(withHours.Dicht_wo, null);
});
