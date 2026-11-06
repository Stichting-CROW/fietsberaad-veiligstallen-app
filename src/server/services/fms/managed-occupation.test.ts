import assert from "node:assert/strict";
import test from "node:test";
import {
  managedPayloadCheckoutType,
  managedPayloadHasCheckout,
  shouldLowerOccupationForManagedCheckout,
} from "./managed-occupation";

const openThenClosed = {
  hasCheckout: true,
  checkoutType: "user",
  transactionAlreadyClosed: false,
  priorQueueHasCheckout: false,
  priorOpenVisit: true,
};

test("closed managed visit lowers occupation once", () => {
  assert.equal(shouldLowerOccupationForManagedCheckout(openThenClosed), true);
});

test("open check-in does not lower occupation", () => {
  assert.equal(
    shouldLowerOccupationForManagedCheckout({ ...openThenClosed, hasCheckout: false }),
    false
  );
});

test("managed sync checkout of an open visit lowers occupation", () => {
  assert.equal(
    shouldLowerOccupationForManagedCheckout({ ...openThenClosed, checkoutType: "sync" }),
    true
  );
});

test("controle checkout of an open visit lowers occupation", () => {
  assert.equal(
    shouldLowerOccupationForManagedCheckout({ ...openThenClosed, checkoutType: "controle" }),
    true
  );
  assert.equal(managedPayloadCheckoutType({ checkouttype: "Controle" }), "controle");
});

test("a visit posted already closed does not lower occupation", () => {
  assert.equal(
    shouldLowerOccupationForManagedCheckout({ ...openThenClosed, priorOpenVisit: false }),
    false
  );
});

test("a resent checkout does not lower occupation again", () => {
  assert.equal(
    shouldLowerOccupationForManagedCheckout({ ...openThenClosed, priorQueueHasCheckout: true }),
    false
  );
  assert.equal(
    shouldLowerOccupationForManagedCheckout({
      ...openThenClosed,
      transactionAlreadyClosed: true,
    }),
    false
  );
});

test("payload checkout fields", () => {
  assert.equal(managedPayloadHasCheckout({ checkoutdate: "2026-11-06T10:00:00Z" }), true);
  assert.equal(managedPayloadHasCheckout({ checkOutDate: "2026-11-06T10:00:00Z" }), true);
  assert.equal(managedPayloadHasCheckout({ checkoutdate: "" }), false);
  assert.equal(managedPayloadHasCheckout({ checkoutdate: null }), false);
  assert.equal(managedPayloadCheckoutType({ checkouttype: "Sync" }), "sync");
  assert.equal(managedPayloadCheckoutType({}), "");
});
