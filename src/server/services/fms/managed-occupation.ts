/**
 * Whether a managed transaction that just entered the queue should lower
 * fietsenstalling_sectie.Bezetting by one.
 *
 * A later processQueues run does not touch that column, so this decision
 * must fire once: when a previously open visit is closed, and not again
 * when the same checkout is resent or when the queue is drained.
 */

export function managedPayloadHasCheckout(payload: Record<string, unknown>): boolean {
  const checkout = payload.checkoutdate ?? payload.checkOutDate;
  return checkout != null && String(checkout).trim() !== "";
}

export function managedPayloadCheckoutType(payload: Record<string, unknown>): string {
  return String(payload.checkouttype ?? payload.checkOutType ?? "")
    .trim()
    .toLowerCase();
}

export function shouldLowerOccupationForManagedCheckout(input: {
  hasCheckout: boolean;
  checkoutType: string;
  transactionAlreadyClosed: boolean;
  priorQueueHasCheckout: boolean;
  priorOpenVisit: boolean;
}): boolean {
  if (!input.hasCheckout) return false;
  if (input.transactionAlreadyClosed) return false;
  if (input.priorQueueHasCheckout) return false;
  return input.priorOpenVisit;
}
