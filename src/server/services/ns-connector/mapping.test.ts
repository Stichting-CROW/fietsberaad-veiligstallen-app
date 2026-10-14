import assert from "node:assert/strict";
import test from "node:test";
import type { NSLocation } from "~/types/ns-connector";
import {
  buildLocationAddress,
  buildLocationUpdateFields,
  externalIdFromUri,
  parseNsTime,
  resolveImageUri,
  typeMapping,
} from "./mapping";

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
