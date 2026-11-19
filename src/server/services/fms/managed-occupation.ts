/**
 * How a managed transaction that just entered the queue changes
 * fietsenstalling_sectie.Bezetting.
 *
 * A later processQueues run does not touch that column, so the change is
 * decided once, from the visit as it stood before this message and the visit
 * this message describes. Check-in and check-out types (user, controle, sync,
 * system, reservation) all count the same way.
 */

export type ManagedVisitState = {
  checkinSection: string;
  /** Null while the visit is open. */
  checkoutSection: string | null;
};

export function managedPayloadHasCheckout(payload: Record<string, unknown>): boolean {
  const checkout = payload.checkoutdate ?? payload.checkOutDate;
  return checkout != null && String(checkout).trim() !== "";
}

function nonEmpty(value: unknown): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text === "" ? null : text;
}

export function managedVisitFromPayload(
  payload: Record<string, unknown>,
  defaultSection: string
): ManagedVisitState | null {
  const checkinSection =
    nonEmpty(payload.sectionid_checkin) ?? nonEmpty(payload.sectionid) ?? nonEmpty(defaultSection);
  if (!checkinSection) return null;
  if (!managedPayloadHasCheckout(payload)) return { checkinSection, checkoutSection: null };
  return { checkinSection, checkoutSection: nonEmpty(payload.sectionid_out) ?? checkinSection };
}

export function managedVisitFromTransactie(row: {
  SectieID: string | null;
  SectieID_uit: string | null;
  Date_checkout: Date | null;
}): ManagedVisitState | null {
  const checkinSection = nonEmpty(row.SectieID);
  if (!checkinSection) return null;
  if (row.Date_checkout == null) return { checkinSection, checkoutSection: null };
  return { checkinSection, checkoutSection: nonEmpty(row.SectieID_uit) ?? checkinSection };
}

/** Change per section external id; sections with a net change of 0 are left out. */
export function managedOccupationDeltas(
  before: ManagedVisitState | null,
  after: ManagedVisitState | null
): Map<string, number> {
  const deltas = new Map<string, number>();
  const add = (section: string, delta: number) => {
    deltas.set(section, (deltas.get(section) ?? 0) + delta);
  };

  if (after != null && (before == null || before.checkoutSection == null)) {
    if (before == null) {
      add(after.checkinSection, 1);
    } else if (before.checkinSection !== after.checkinSection) {
      add(before.checkinSection, -1);
      add(after.checkinSection, 1);
    }
    if (after.checkoutSection != null) add(after.checkoutSection, -1);
  }

  for (const [section, delta] of deltas) {
    if (delta === 0) deltas.delete(section);
  }
  return deltas;
}
