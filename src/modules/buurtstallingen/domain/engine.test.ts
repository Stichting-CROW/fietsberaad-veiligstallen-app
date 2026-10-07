import assert from "node:assert/strict";
import test from "node:test";
import {
  changeOccupationStatus,
  createReservation,
  entryQualifies,
  findSectionWithFreePlace,
  matchWaitingList,
  reorderSequence,
} from "./engine";
import { EXPIRY_ACCEPT_DAYS, EXPIRY_CANCEL_DAYS, EXPIRY_RESERVATION_DAYS, type Place, type Section, type WaitingListEntry } from "./types";

const now = new Date("2026-10-02T10:00:00.000Z");

function place(id: string, bikeTypeId: number, occupied = false): Place {
  return {
    id,
    title: id,
    bikeTypeIds: [bikeTypeId],
    occupation: occupied
      ? {
          id: `occ-${id}`,
          accountId: "acc",
          status: "OCCUPIED",
          expiryDate: null,
          bikeTypeId,
          placeId: id,
        }
      : null,
  };
}

function sections(): Section[] {
  return [
    {
      id: "2",
      title: "Boven",
      qualification: "ABOVE",
      places: [place("b1", 1)],
    },
    {
      id: "1",
      title: "Onder",
      qualification: "UNDER",
      places: [place("a1", 1), place("a2", 1, true)],
    },
  ];
}

test("reservation picks the lowest section id that matches", () => {
  const result = createReservation({
    sections: sections(),
    qualification: "NONE",
    bikeTypeId: 1,
    accountId: "person",
    now,
  });
  assert.equal(result.placeId, "a1");
  assert.equal(result.status, "RESERVED");
  assert.equal(result.expiryDate.toISOString().slice(0, 10), "2026-10-18");
  assert.equal(
    Math.round((result.expiryDate.getTime() - now.getTime()) / 86400000),
    EXPIRY_RESERVATION_DAYS,
  );
});

test("under preference does not take an above-only section when a none request would", () => {
  assert.throws(() =>
    findSectionWithFreePlace(
      [{ id: "9", title: "Boven", qualification: "ABOVE", places: [place("b1", 1)] }],
      "UNDER",
      1,
    ),
  );
});

test("accepting a proposal sets 14 days and cancelling an occupied place sets 7", () => {
  const occupation = {
    id: "o",
    accountId: "a",
    status: "PROPOSED" as const,
    expiryDate: new Date("2026-10-20T10:00:00.000Z"),
    bikeTypeId: 1,
    placeId: "p",
  };
  const accepted = changeOccupationStatus({ occupation, next: "RESERVED", now });
  assert.equal(accepted.kind, "updated");
  if (accepted.kind !== "updated") return;
  assert.equal(
    Math.round((accepted.occupation.expiryDate!.getTime() - now.getTime()) / 86400000),
    EXPIRY_ACCEPT_DAYS,
  );

  const occupied = { ...accepted.occupation, status: "OCCUPIED" as const };
  const cancelled = changeOccupationStatus({ occupation: occupied, next: "CANCELLED", now });
  assert.equal(cancelled.kind, "updated");
  if (cancelled.kind !== "updated") return;
  assert.equal(
    Math.round((cancelled.occupation.expiryDate!.getTime() - now.getTime()) / 86400000),
    EXPIRY_CANCEL_DAYS,
  );
});

test("illegal transition is rejected", () => {
  assert.throws(() =>
    changeOccupationStatus({
      occupation: {
        id: "o",
        accountId: "a",
        status: "OCCUPIED",
        expiryDate: null,
        bikeTypeId: 1,
        placeId: "p",
      },
      next: "RESERVED",
      now,
    }),
  );
});

test("freeing a proposal before expiry is a decline", () => {
  const result = changeOccupationStatus({
    occupation: {
      id: "o",
      accountId: "a",
      status: "PROPOSED",
      expiryDate: new Date("2026-10-20T10:00:00.000Z"),
      bikeTypeId: 1,
      placeId: "p",
    },
    next: "FREE",
    now,
  });
  assert.equal(result.kind, "removed");
  if (result.kind === "removed") assert.equal(result.reason, "declined");
});

test("waiting list offers the first matching entry, not a later none entry ahead of a specific one", () => {
  const section: Section = {
    id: "1",
    title: "Onder",
    qualification: "UNDER",
    places: [place("a1", 1)],
  };
  const freed = section.places[0]!;
  const entries: WaitingListEntry[] = [
    {
      id: "later",
      accountId: "b",
      qualification: "NONE",
      bikeTypeIds: [1],
      sequenceNumber: 2,
      creationDate: now,
      mailingDate: now,
    },
    {
      id: "first",
      accountId: "a",
      qualification: "UNDER",
      bikeTypeIds: [1],
      sequenceNumber: 1,
      creationDate: now,
      mailingDate: now,
    },
  ];
  const match = matchWaitingList({ entries, place: freed, section });
  assert.equal(match?.id, "first");
  assert.equal(entryQualifies(entries[0]!, freed, section), true);
});

test("reorder clamps the sequence and renumbers", () => {
  const entries: WaitingListEntry[] = [1, 2, 3].map((sequenceNumber) => ({
    id: String(sequenceNumber),
    accountId: String(sequenceNumber),
    qualification: "NONE" as const,
    bikeTypeIds: [1],
    sequenceNumber,
    creationDate: now,
    mailingDate: now,
  }));
  const next = reorderSequence(entries, "3", 1);
  assert.deepEqual(
    next.map((entry) => entry.id),
    ["3", "1", "2"],
  );
  assert.deepEqual(
    next.map((entry) => entry.sequenceNumber),
    [1, 2, 3],
  );
});
