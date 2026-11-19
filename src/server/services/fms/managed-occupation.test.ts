import assert from "node:assert/strict";
import test from "node:test";
import {
  managedOccupationDeltas,
  managedPayloadHasCheckout,
  managedVisitFromPayload,
  managedVisitFromTransactie,
} from "./managed-occupation";

const deltas = (...args: Parameters<typeof managedOccupationDeltas>) =>
  Object.fromEntries(managedOccupationDeltas(...args));

const open = (section: string) => ({ checkinSection: section, checkoutSection: null });
const closed = (checkin: string, checkout = checkin) => ({
  checkinSection: checkin,
  checkoutSection: checkout,
});

test("a new open visit adds one to the check-in section", () => {
  assert.deepEqual(deltas(null, open("A")), { A: 1 });
});

test("a new visit posted closed in the same section changes nothing", () => {
  assert.deepEqual(deltas(null, closed("A")), {});
});

test("a new visit posted closed in another section moves one bike", () => {
  assert.deepEqual(deltas(null, closed("A", "B")), { A: 1, B: -1 });
});

test("closing an open visit subtracts one from the check-out section", () => {
  assert.deepEqual(deltas(open("A"), closed("A")), { A: -1 });
  assert.deepEqual(deltas(open("A"), closed("A", "B")), { B: -1 });
});

test("a resent open or closed visit changes nothing", () => {
  assert.deepEqual(deltas(open("A"), open("A")), {});
  assert.deepEqual(deltas(closed("A"), closed("A")), {});
  assert.deepEqual(deltas(closed("A"), open("A")), {});
});

test("an open visit resent with another check-in section moves it", () => {
  assert.deepEqual(deltas(open("A"), open("B")), { A: -1, B: 1 });
});

test("controle check-in then controle check-out counts +1 and then -1", () => {
  const checkin = managedVisitFromPayload(
    { sectionid: "A", checkintype: "controle", checkindate: "2026-11-09T08:00:00Z" },
    "A"
  );
  const checkout = managedVisitFromPayload(
    {
      sectionid: "A",
      checkintype: "controle",
      checkindate: "2026-11-09T08:00:00Z",
      checkouttype: "controle",
      checkoutdate: "2026-11-09T08:05:00Z",
    },
    "A"
  );
  assert.deepEqual(deltas(null, checkin), { A: 1 });
  assert.deepEqual(deltas(checkin, checkout), { A: -1 });
});

test("a sync check-out of an open visit subtracts one", () => {
  const checkout = managedVisitFromPayload(
    { sectionid: "A", checkouttype: "sync", checkoutdate: "2026-11-09T08:05:00Z" },
    "A"
  );
  assert.deepEqual(deltas(open("A"), checkout), { A: -1 });
});

test("visit state from a payload", () => {
  assert.deepEqual(managedVisitFromPayload({}, "A"), open("A"));
  assert.deepEqual(managedVisitFromPayload({ sectionid_checkin: "B" }, "A"), open("B"));
  assert.deepEqual(
    managedVisitFromPayload({ checkoutdate: "2026-11-09T08:05:00Z", sectionid_out: "C" }, "A"),
    closed("A", "C")
  );
  assert.equal(managedVisitFromPayload({}, ""), null);
});

test("visit state from a transacties row", () => {
  assert.deepEqual(
    managedVisitFromTransactie({ SectieID: "A", SectieID_uit: null, Date_checkout: null }),
    open("A")
  );
  assert.deepEqual(
    managedVisitFromTransactie({ SectieID: "A", SectieID_uit: null, Date_checkout: new Date() }),
    closed("A")
  );
});

test("payload checkout fields", () => {
  assert.equal(managedPayloadHasCheckout({ checkoutdate: "2026-11-06T10:00:00Z" }), true);
  assert.equal(managedPayloadHasCheckout({ checkOutDate: "2026-11-06T10:00:00Z" }), true);
  assert.equal(managedPayloadHasCheckout({ checkoutdate: "" }), false);
  assert.equal(managedPayloadHasCheckout({ checkoutdate: null }), false);
});
