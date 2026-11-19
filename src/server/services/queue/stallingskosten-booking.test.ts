import assert from "node:assert/strict";
import test from "node:test";
import { moneyDelta, sectionDisplayName, stallingFeeCopy, vatIncluded } from "./stallingskosten-booking";

const utrecht = {
  sectionCount: 1,
  sectionTitle: "1",
  stallingTitle: "Utrecht Laag Catharijne",
  stallingType: "bewaakt",
  city: "Utrecht",
  councilName: "Utrecht",
};

test("inclusive VAT of a 1.95 fee is 0.34", () => {
  assert.equal(vatIncluded(-1.95), -0.34);
  assert.equal(vatIncluded(1.95), 0.34);
});

test("fee delta is the visit total minus what is already booked", () => {
  assert.equal(moneyDelta(1.95, 0), 1.95);
  assert.equal(moneyDelta(1.95, 1.95), 0);
  assert.equal(moneyDelta(0, 1.95), -1.95);
});

test("a stalling with one section uses the stalling title", () => {
  assert.equal(sectionDisplayName(utrecht), "Utrecht Laag Catharijne te Utrecht");
});

test("a stalling with more sections names the sector and the location", () => {
  assert.equal(
    sectionDisplayName({ ...utrecht, sectionCount: 3, sectionTitle: "A" }),
    "sector A van locatie Utrecht Laag Catharijne te Utrecht"
  );
});

test("a locker stalling names the kluis", () => {
  assert.equal(
    sectionDisplayName({ ...utrecht, sectionCount: 2, sectionTitle: "12", stallingType: "fietskluizen" }),
    "kluis 12 van locatie Utrecht Laag Catharijne te Utrecht"
  );
});

test("an empty city falls back to the council name", () => {
  assert.equal(
    sectionDisplayName({ ...utrecht, city: "" }),
    "Utrecht Laag Catharijne te Utrecht"
  );
});

test("a priced visit is a Stallingstransactie for the bike type", () => {
  const copy = stallingFeeCopy(1.95, "Bromfietsen", "bewaakt", "Utrecht Laag Catharijne te Utrecht");
  assert.equal(copy.code, "Stallingstransactie");
  assert.equal(copy.description, "Stalling bromfietsen in Utrecht Laag Catharijne te Utrecht");
});

test("a locker fee names the kluis and skips the bike type", () => {
  const copy = stallingFeeCopy(1.5, "Fiets", "fietskluizen", "kluis 12 te Utrecht");
  assert.equal(copy.code, "Stallingstransactie");
  assert.equal(copy.description, "Stalling in kluis kluis 12 te Utrecht");
});

test("a lower total is a correction", () => {
  const copy = stallingFeeCopy(-1.95, "Bromfietsen", "bewaakt", "Utrecht Laag Catharijne te Utrecht");
  assert.equal(copy.code, "Afwaardering in stalling");
  assert.equal(copy.description, "Correctie betaling stalling in Utrecht Laag Catharijne te Utrecht");
});
