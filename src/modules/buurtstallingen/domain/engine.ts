import {
  ALLOWED_ACTIONS,
  type Occupation,
  type OccupationStatus,
  type Place,
  type Qualification,
  type Section,
  type WaitingListEntry,
  DomainError,
  EXPIRY_ACCEPT_DAYS,
  EXPIRY_CANCEL_DAYS,
  EXPIRY_RESERVATION_DAYS,
  WAITINGLIST_MAIL_MONTHS,
} from "./types";

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

export function addMonths(date: Date, months: number): Date {
  const next = new Date(date.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
}

export function qualificationsMatch(requested: Qualification, section: Qualification): boolean {
  return requested === section || requested === "NONE" || section === "NONE";
}

export function bikeTypesOverlap(left: number[], right: number[]): boolean {
  return left.some((id) => right.includes(id));
}

export function isAllowedTransition(from: OccupationStatus, to: OccupationStatus): boolean {
  return ALLOWED_ACTIONS[from].includes(to);
}

export function actionLabel(from: OccupationStatus, to: OccupationStatus): string {
  const key = `${from}->${to}`;
  const labels: Record<string, string> = {
    "RESERVED->OCCUPIED": "Sleutel opgehaald",
    "RESERVED->FREE": "Persoon geweigerd",
    "PROPOSED->RESERVED": "Voorstel geaccepteerd",
    "PROPOSED->FREE": "Voorstel geweigerd",
    "OCCUPIED->CANCELLED": "Opzeggen",
    "OCCUPIED->FREE": "Sleutel ingeleverd",
    "CANCELLED->FREE": "Sleutel ingeleverd",
    "FREE->RESERVED": "Reserveren",
    "FREE->OCCUPIED": "Bezet zetten",
    "FREE->PROPOSED": "Voorstel versturen",
  };
  return labels[key] ?? to;
}

export function statusLabel(status: OccupationStatus): string {
  const labels: Record<OccupationStatus, string> = {
    FREE: "Vrij",
    RESERVED: "Gereserveerd",
    PROPOSED: "Voorstel verstuurd",
    OCCUPIED: "Bezet",
    CANCELLED: "Opgezegd",
  };
  return labels[status];
}

function placeStatus(place: Place): OccupationStatus {
  return place.occupation?.status ?? "FREE";
}

export function findSectionWithFreePlace(
  sections: Section[],
  qualification: Qualification,
  bikeTypeId: number,
): { section: Section; place: Place } {
  const ordered = [...sections].sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
  for (const section of ordered) {
    if (!qualificationsMatch(qualification, section.qualification)) continue;
    const place = section.places.find(
      (candidate) => placeStatus(candidate) === "FREE" && candidate.bikeTypeIds.includes(bikeTypeId),
    );
    if (place) return { section, place };
  }
  throw new DomainError("no.place", "Geen geschikte vrije plek");
}

export function countFree(sections: Section[], bikeTypeId: number): number {
  return sections.reduce(
    (sum, section) =>
      sum +
      section.places.filter(
        (place) => placeStatus(place) === "FREE" && place.bikeTypeIds.includes(bikeTypeId),
      ).length,
    0,
  );
}

export type NewOccupation = {
  placeId: string;
  sectionId: string;
  accountId: string;
  bikeTypeId: number;
  status: "RESERVED" | "PROPOSED";
  expiryDate: Date;
};

export function createReservation(input: {
  sections: Section[];
  qualification: Qualification;
  bikeTypeId: number;
  accountId: string;
  now: Date;
}): NewOccupation {
  const match = findSectionWithFreePlace(input.sections, input.qualification, input.bikeTypeId);
  return {
    placeId: match.place.id,
    sectionId: match.section.id,
    accountId: input.accountId,
    bikeTypeId: input.bikeTypeId,
    status: "RESERVED",
    expiryDate: addDays(input.now, EXPIRY_RESERVATION_DAYS),
  };
}

export function createProposal(input: {
  sections: Section[];
  qualification: Qualification;
  bikeTypeIds: number[];
  accountId: string;
  now: Date;
  preferredPlaceId?: string;
}): NewOccupation {
  if (input.preferredPlaceId) {
    for (const section of input.sections) {
      const place = section.places.find((candidate) => candidate.id === input.preferredPlaceId);
      if (!place) continue;
      if (placeStatus(place) !== "FREE") {
        throw new DomainError("place.taken", "De plek is niet vrij");
      }
      if (!qualificationsMatch(input.qualification, section.qualification)) {
        throw new DomainError("qualification", "De plek past niet bij de rekvoorkeur");
      }
      if (!bikeTypesOverlap(input.bikeTypeIds, place.bikeTypeIds)) {
        throw new DomainError("biketype", "De plek past niet bij het fietstype");
      }
      const bikeTypeId = input.bikeTypeIds.find((id) => place.bikeTypeIds.includes(id)) ?? place.bikeTypeIds[0];
      if (bikeTypeId === undefined) throw new DomainError("biketype", "Geen fietstype");
      return {
        placeId: place.id,
        sectionId: section.id,
        accountId: input.accountId,
        bikeTypeId,
        status: "PROPOSED",
        expiryDate: addDays(input.now, EXPIRY_RESERVATION_DAYS),
      };
    }
  }
  const bikeTypeId = input.bikeTypeIds[0];
  if (bikeTypeId === undefined) throw new DomainError("biketype", "Geen fietstype");
  const match = findSectionWithFreePlace(input.sections, input.qualification, bikeTypeId);
  return {
    placeId: match.place.id,
    sectionId: match.section.id,
    accountId: input.accountId,
    bikeTypeId,
    status: "PROPOSED",
    expiryDate: addDays(input.now, EXPIRY_RESERVATION_DAYS),
  };
}

export type StatusChange =
  | { kind: "removed"; previous: Occupation; reason: "declined" | "expired" | "released" }
  | { kind: "updated"; occupation: Occupation; previousStatus: Occupation["status"] };

export function changeOccupationStatus(input: {
  occupation: Occupation;
  next: OccupationStatus;
  now: Date;
  expiryDate?: Date | null;
}): StatusChange {
  if (!isAllowedTransition(input.occupation.status, input.next)) {
    throw new DomainError(
      "transition",
      `Status ${input.occupation.status} kan niet naar ${input.next}`,
    );
  }
  if (input.next === "FREE") {
    const expired =
      input.occupation.expiryDate !== null && input.occupation.expiryDate.getTime() < input.now.getTime();
    const reason =
      input.occupation.status === "PROPOSED" && !expired
        ? "declined"
        : (input.occupation.status === "RESERVED" || input.occupation.status === "PROPOSED") && expired
          ? "expired"
          : "released";
    return { kind: "removed", previous: input.occupation, reason };
  }
  let expiry = input.expiryDate === undefined ? input.occupation.expiryDate : input.expiryDate;
  if (input.occupation.status === "PROPOSED" && input.next === "RESERVED" && input.expiryDate === undefined) {
    expiry = addDays(input.now, EXPIRY_ACCEPT_DAYS);
  }
  if (input.occupation.status === "OCCUPIED" && input.next === "CANCELLED" && input.expiryDate === undefined) {
    expiry = addDays(input.now, EXPIRY_CANCEL_DAYS);
  }
  return {
    kind: "updated",
    previousStatus: input.occupation.status,
    occupation: { ...input.occupation, status: input.next, expiryDate: expiry },
  };
}

export function entryQualifies(entry: WaitingListEntry, place: Place, section: Section): boolean {
  return (
    qualificationsMatch(entry.qualification, section.qualification) &&
    bikeTypesOverlap(entry.bikeTypeIds, place.bikeTypeIds)
  );
}

/** First waiting-list entry, by sequence, that fits the freed place. */
export function matchWaitingList(input: {
  entries: WaitingListEntry[];
  place: Place;
  section: Section;
}): WaitingListEntry | null {
  const ordered = [...input.entries].sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  return ordered.find((entry) => entryQualifies(entry, input.place, input.section)) ?? null;
}

export function nextSequence(entries: WaitingListEntry[]): number {
  if (entries.length === 0) return 1;
  return Math.max(...entries.map((entry) => entry.sequenceNumber)) + 1;
}

export function initialMailingDate(now: Date): Date {
  return addMonths(now, WAITINGLIST_MAIL_MONTHS);
}

export function reorderSequence(entries: WaitingListEntry[], entryId: string, sequenceNumber: number): WaitingListEntry[] {
  const current = entries.find((entry) => entry.id === entryId);
  if (!current) throw new DomainError("waitinglist.missing", "Wachtlijstregel niet gevonden");
  const others = entries
    .filter((entry) => entry.id !== entryId)
    .sort((a, b) => a.sequenceNumber - b.sequenceNumber);
  const index = Math.min(Math.max(sequenceNumber, 1), entries.length) - 1;
  others.splice(index, 0, current);
  return others.map((entry, position) => ({ ...entry, sequenceNumber: position + 1 }));
}

export function canShrinkSection(section: Section, bikeTypeId: number, removeCount: number): boolean {
  const free = section.places.filter(
    (place) => placeStatus(place) === "FREE" && place.bikeTypeIds.includes(bikeTypeId),
  ).length;
  return free >= removeCount;
}

export function sectionHasOccupation(section: Section): boolean {
  return section.places.some((place) => place.occupation !== null);
}
