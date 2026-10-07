/**
 * Compares the Java WAR on localhost:8088 with the TypeScript slot engine.
 * Uses only the Compose MySQL (engine-parity). Does not touch DATABASE_URL.
 *
 * Run: npx tsx e2e/engine-parity/compare.ts
 */
import { execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import {
  addDays,
  addMonths,
  canShrinkSection,
  changeOccupationStatus,
  createReservation,
  matchWaitingList,
  reorderSequence,
  sectionHasOccupation,
} from "../../src/modules/buurtstallingen/domain/engine";
import {
  EXPIRY_ACCEPT_DAYS,
  EXPIRY_CANCEL_DAYS,
  EXPIRY_RESERVATION_DAYS,
  WAITINGLIST_MAIL_MONTHS,
  bikeTypeToStored,
  type Qualification,
  type Section,
  type WaitingListEntry,
} from "../../src/modules/buurtstallingen/domain/types";

const JAVA = process.env.JAVA_BASE ?? "http://127.0.0.1:8088/bikepark/v1";
const MAIL = process.env.MAIL_BASE ?? "http://127.0.0.1:8081";
const failures: string[] = [];
const notes: string[] = [];

function note(message: string) {
  notes.push(message);
  console.log("note", message);
}

function check(condition: unknown, message: string) {
  if (condition) {
    console.log("ok", message);
    return;
  }
  failures.push(message);
  console.error("FAIL", message);
}

function sql(statement: string) {
  execFileSync(
    "docker",
    ["exec", "engine-parity-mysql-1", "mysql", "-uroot", "-pparity", "bikepark", "-e", statement],
    { stdio: "pipe" },
  );
}

function sqlValue(statement: string) {
  return execFileSync(
    "docker",
    ["exec", "engine-parity-mysql-1", "mysql", "-uroot", "-pparity", "-N", "bikepark", "-e", statement],
    { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
  )
    .replace(/mysql: \[Warning\][^\n]*\n/g, "")
    .trim();
}

function id(prefix: string) {
  return `${prefix}${randomBytes(8).toString("hex")}`.slice(0, 35);
}

type JavaPlace = {
  id: string;
  title: string;
  status: string;
  bikeTypes?: { id: number }[];
  bikeParkOccupation?: {
    id: string;
    status: string;
    expiryDate?: number;
    accountHolder?: { id: string };
    bikeType?: { id: number };
  } | null;
};

type JavaSection = {
  id: number;
  title: string;
  qualification: Qualification;
  bikeparkPlaces: JavaPlace[];
};

async function call(method: string, path: string) {
  const response = await fetch(`${JAVA}${path}`, { method });
  const text = await response.text();
  let json: unknown = null;
  if (text) {
    try {
      json = JSON.parse(text);
    } catch {
      json = text;
    }
  }
  return { status: response.status, json };
}

function sectionsFrom(rows: JavaSection[]): Section[] {
  return rows.map((row) => ({
    id: String(row.id),
    title: row.title,
    qualification: row.qualification,
    places: row.bikeparkPlaces.map((place) => ({
      id: place.id,
      title: place.title,
      bikeTypeIds: (place.bikeTypes ?? []).map((bikeType) => bikeType.id),
      occupation:
        place.status === "FREE" || !place.bikeParkOccupation
          ? null
          : {
              id: place.bikeParkOccupation.id,
              accountId: place.bikeParkOccupation.accountHolder?.id ?? "",
              status: place.bikeParkOccupation.status as "RESERVED",
              expiryDate: place.bikeParkOccupation.expiryDate
                ? new Date(place.bikeParkOccupation.expiryDate)
                : null,
              bikeTypeId: place.bikeParkOccupation.bikeType?.id ?? 0,
              placeId: place.id,
            },
    })),
  }));
}

async function sections(parkId: string): Promise<JavaSection[]> {
  const result = await call("GET", `/bikepark/${parkId}/section`);
  check(result.status === 200, `GET sections ${parkId} → ${result.status}`);
  return result.json as JavaSection[];
}

async function seedPark(title: string) {
  const parkId = id("p");
  const accounts = [id("a"), id("b"), id("c")];
  const values = accounts.map((accountId, index) => `('${accountId}','${accountId}@parity.test','P','${index}')`).join(",");
  sql(
    `INSERT INTO fietsenstallingen (id, title) VALUES ('${parkId}','${title}'); INSERT INTO accounts (id, email, firstname, lastname) VALUES ${values};`,
  );
  return { parkId, accounts };
}

async function addSection(parkId: string, title: string, qualification: Qualification, capacity: number, bikeTypeId: number) {
  const result = await call(
    "POST",
    `/bikepark/${parkId}/section?title=${encodeURIComponent(title)}&qualification=${qualification}&capacity=${capacity}&bikeTypeId=${bikeTypeId}`,
  );
  check(result.status === 201, `section ${title} ${qualification} ×${capacity} bike ${bikeTypeId} → ${result.status}`);
  return result;
}

function expiryClose(actual: number | undefined, started: number) {
  if (!actual) return false;
  const expected = addDays(new Date(started), EXPIRY_RESERVATION_DAYS).getTime();
  return Math.abs(actual - expected) < 5000;
}

async function reservationMatchesDomain(parkId: string, accountId: string, bikeTypeId: number, qualification: Qualification) {
  const before = sectionsFrom(await sections(parkId));
  const started = Date.now();
  const expected = createReservation({ sections: before, qualification, bikeTypeId, accountId, now: new Date(started) });
  const result = await call(
    "POST",
    `/bikepark/${parkId}/reservation?bikeTypeId=${bikeTypeId}&qualification=${qualification}&accountId=${accountId}`,
  );
  const data = (result.json as { data?: { status?: string; bikeParkPlaceId?: string; bikeType?: { id: number }; expiryDate?: number } })?.data;
  check(result.status === 201, `reserve ${accountId} HTTP ${result.status}`);
  check(data?.status === expected.status, `reserve ${accountId} status ${data?.status} = ${expected.status}`);
  check(data?.bikeParkPlaceId === expected.placeId, `reserve ${accountId} place ${data?.bikeParkPlaceId} = ${expected.placeId}`);
  check(data?.bikeType?.id === expected.bikeTypeId, `reserve ${accountId} bike ${data?.bikeType?.id} = ${expected.bikeTypeId}`);
  check(expiryClose(data?.expiryDate, started), `reserve ${accountId} expiry is +${EXPIRY_RESERVATION_DAYS} days`);
  if (data?.bikeParkPlaceId) {
    const storedPlace = sqlValue(
      `SELECT fiets_type_id FROM plaats_fietstype pft JOIN fietsenstalling_plek p ON p.id = pft.plaats_id WHERE p.plek_uuid='${data.bikeParkPlaceId}'`,
    );
    const storedOccupation = sqlValue(
      `SELECT fiets_type_id FROM fietsenstalling_plek_bezetting WHERE account_id='${accountId}' ORDER BY verloopdatum DESC LIMIT 1`,
    );
    const stored = String(bikeTypeToStored(expected.bikeTypeId));
    check(storedPlace === stored && storedOccupation === stored, `column stores bike type ${expected.bikeTypeId} as ${stored}`);
  }
  return data;
}

async function main() {
  const health = await call("GET", "/bikepark/statuslist");
  check(health.status === 200 && Array.isArray(health.json), "Java status list is up");

  await reservationAndWaitingList();
  await qualificationMiss();
  await hashSetSectionOrder();
  await illegalTransitionIsAllowListed();
  await reservationMail();
  await swapExchangesAccounts();
  await sectionCapacityAndDelete();
  await wrongBikeTypeAndUnderSection();
  await waitingListOrder();
  await statusClocks();
  await expiryThenOffer();
  await declineProposal();
  await underRequestMatchesNoneSection();

  if (notes.length) console.log(`\n${notes.length} allow-list notes`);
  if (failures.length) {
    console.error(`\n${failures.length} comparison failure(s)`);
    process.exit(1);
  }
  console.log("\nengine parity scenarios passed");
}

async function reservationAndWaitingList() {
  const { parkId, accounts } = await seedPark("reserve");
  const [first, second, third] = accounts;
  await addSection(parkId, "A", "NONE", 2, 1);

  await reservationMatchesDomain(parkId, first!, 1, "NONE");
  await reservationMatchesDomain(parkId, second!, 1, "NONE");

  let domainRefused = false;
  try {
    createReservation({
      sections: sectionsFrom(await sections(parkId)),
      qualification: "NONE",
      bikeTypeId: 1,
      accountId: third!,
      now: new Date(),
    });
  } catch {
    domainRefused = true;
  }
  const full = await call("POST", `/bikepark/${parkId}/reservation?bikeTypeId=1&qualification=NONE&accountId=${third}`);
  check(domainRefused && full.status !== 201, `full stalling refuses a third reservation (Java ${full.status})`);

  const waiting = await call("POST", `/bikepark/${parkId}/waitinglist?accountId=${third}&qualification=NONE&bikeTypeId=1`);
  check(waiting.status === 201, `waiting list while full → ${waiting.status}`);
  const listed = await call("GET", `/bikepark/${parkId}/waitinglist`);
  const entries = extractEntries(listed.json);
  check(entries.length === 1 && entries[0]?.accountId === third, "waiting list keeps the account that could not reserve");
  const mailing = sqlValue(`SELECT datum_mailing FROM wachtlijst_item WHERE account_id='${third}'`);
  const mailingInstant = Date.parse(`${mailing.replace(" ", "T")}Z`);
  const expectedMail = addMonths(new Date(), WAITINGLIST_MAIL_MONTHS).getTime();
  check(
    Number.isFinite(mailingInstant) && Math.abs(mailingInstant - expectedMail) < 120_000,
    `waiting-list mailing date is about six months ahead (${mailing || "missing"})`,
  );

  const other = id("d");
  sql(`INSERT INTO accounts (id, email, firstname, lastname) VALUES ('${other}','${other}@parity.test','Q','4');`);
  const skipped = await call("POST", `/bikepark/${parkId}/waitinglist?accountId=${other}&qualification=NONE&bikeTypeId=4`);
  check(skipped.status === 201, `second waiting-list entry (other bike) → ${skipped.status}`);

  const occupied = (await sections(parkId))[0]?.bikeparkPlaces.find((place) => place.status === "RESERVED");
  check(Boolean(occupied), "a reserved place exists to free");
  if (!occupied) return;
  const sectionId = (await sections(parkId))[0]?.id;
  const freed = await call(
    "POST",
    `/bikepark/${parkId}/${sectionId}/${occupied.id}/occupation?status=FREE&expiryDate=2026-10-19`,
  );
  check(freed.status === 200, `free place → ${freed.status}`);

  const after = (await sections(parkId))[0];
  const proposal = after?.bikeparkPlaces.find((place) => place.status === "PROPOSED");
  const domainMatch = matchWaitingList({
    entries: [
      {
        id: "1",
        accountId: third!,
        qualification: "NONE",
        bikeTypeIds: [1],
        sequenceNumber: 1,
        creationDate: new Date(),
        mailingDate: new Date(),
      },
      {
        id: "2",
        accountId: other,
        qualification: "NONE",
        bikeTypeIds: [4],
        sequenceNumber: 2,
        creationDate: new Date(),
        mailingDate: new Date(),
      },
    ],
    place: {
      id: occupied.id,
      title: occupied.title,
      bikeTypeIds: [1],
      occupation: null,
    },
    section: {
      id: String(sectionId),
      title: "A",
      qualification: "NONE",
      places: [],
    },
  });
  check(proposal?.bikeParkOccupation?.accountHolder?.id === third, `proposal goes to the matching account, got ${proposal?.bikeParkOccupation?.accountHolder?.id}`);
  check(domainMatch?.accountId === third, "domain matchWaitingList picks the same account");
  const remaining = extractEntries((await call("GET", `/bikepark/${parkId}/waitinglist`)).json);
  check(
    remaining.some((entry) => entry.accountId === other) && !remaining.some((entry) => entry.accountId === third),
    "the offered entry is removed and the other bike type stays",
  );
}

function localYmd(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function extractEntries(json: unknown): { id: string; accountId: string; mailingDate?: number; sequence?: number }[] {
  const root = json as { searchData?: unknown; data?: unknown; content?: unknown };
  const list = [root?.searchData, root?.data, root?.content].find(Array.isArray) as
    | Record<string, unknown>[]
    | undefined;
  if (!list) return [];
  return list.map((entry) => {
    const holder = entry.accountHolder as { id?: string } | undefined;
    const mailing = entry.mailingDate ?? entry.datumMailing;
    return {
      id: String(entry.id ?? ""),
      accountId: String(holder?.id ?? entry.accountId ?? ""),
      mailingDate: typeof mailing === "number" ? mailing : undefined,
      sequence: typeof entry.sequenceNumber === "number" ? entry.sequenceNumber : undefined,
    };
  });
}

async function qualificationMiss() {
  const { parkId, accounts } = await seedPark("qual");
  await addSection(parkId, "Boven", "ABOVE", 1, 1);
  let domainRefused = false;
  try {
    createReservation({
      sections: sectionsFrom(await sections(parkId)),
      qualification: "UNDER",
      bikeTypeId: 1,
      accountId: accounts[0]!,
      now: new Date(),
    });
  } catch {
    domainRefused = true;
  }
  const result = await call(
    "POST",
    `/bikepark/${parkId}/reservation?bikeTypeId=1&qualification=UNDER&accountId=${accounts[0]}`,
  );
  check(domainRefused && result.status !== 201, `UNDER does not take an ABOVE section (Java ${result.status})`);
  const none = await reservationMatchesDomain(parkId, accounts[1]!, 1, "NONE");
  check(Boolean(none?.bikeParkPlaceId), "NONE still matches an ABOVE section");
}

async function hashSetSectionOrder() {
  const { parkId, accounts } = await seedPark("order");
  await addSection(parkId, "Second", "NONE", 1, 1);
  await addSection(parkId, "First", "NONE", 1, 1);
  const before = sectionsFrom(await sections(parkId));
  const expected = createReservation({
    sections: before,
    qualification: "NONE",
    bikeTypeId: 1,
    accountId: accounts[0]!,
    now: new Date(),
  });
  const result = await call(
    "POST",
    `/bikepark/${parkId}/reservation?bikeTypeId=1&qualification=NONE&accountId=${accounts[0]}`,
  );
  const placeId = (result.json as { data?: { bikeParkPlaceId?: string } })?.data?.bikeParkPlaceId;
  if (placeId === expected.placeId) {
    check(true, "two sections: Java picked the same section as the stable id order");
  } else {
    note(`HashSet section order differed (Java ${placeId}, stable ${expected.placeId}); allow-listed`);
  }
}

async function illegalTransitionIsAllowListed() {
  const { parkId, accounts } = await seedPark("trans");
  await addSection(parkId, "A", "NONE", 1, 1);
  const reserved = await reservationMatchesDomain(parkId, accounts[0]!, 1, "NONE");
  const sectionId = (await sections(parkId))[0]?.id;
  const placeId = reserved?.bikeParkPlaceId;
  if (!placeId || sectionId === undefined) return;
  const java = await call(
    "POST",
    `/bikepark/${parkId}/${sectionId}/${placeId}/occupation?status=CANCELLED&expiryDate=2026-10-19`,
  );
  let domainRefused = false;
  try {
    changeOccupationStatus({
      occupation: {
        id: "x",
        accountId: accounts[0]!,
        status: "RESERVED",
        expiryDate: new Date(),
        bikeTypeId: 1,
        placeId,
      },
      next: "CANCELLED",
      now: new Date(),
    });
  } catch {
    domainRefused = true;
  }
  check(domainRefused, "domain refuses RESERVED → CANCELLED");
  if (java.status === 200) {
    note("Java accepts RESERVED → CANCELLED; enforced transitions are allow-listed");
  } else {
    check(true, `Java also refused RESERVED → CANCELLED (${java.status})`);
  }
}

async function swapExchangesAccounts() {
  const { parkId, accounts } = await seedPark("swap");
  const [first, second] = accounts;
  await addSection(parkId, "A", "NONE", 2, 1);
  const reservedA = await reservationMatchesDomain(parkId, first!, 1, "NONE");
  const reservedB = await reservationMatchesDomain(parkId, second!, 1, "NONE");
  const sectionId = (await sections(parkId))[0]?.id;
  const swapped = await call(
    "PUT",
    `/bikepark/${parkId}/swapoccupation?sectionId1=${sectionId}&sectionId2=${sectionId}&placeId1=${reservedA?.bikeParkPlaceId}&placeId2=${reservedB?.bikeParkPlaceId}`,
  );
  check(swapped.status === 200, `swap → ${swapped.status}`);
  const places = (await sections(parkId))[0]?.bikeparkPlaces ?? [];
  const accountOn = (accountId: string) => places.find((place) => place.bikeParkOccupation?.accountHolder?.id === accountId);
  check(accountOn(first!)?.id === reservedB?.bikeParkPlaceId, "swap moves the first account onto the second place");
  check(accountOn(second!)?.id === reservedA?.bikeParkPlaceId, "swap moves the second account onto the first place");
  check(accountOn(first!)?.status === "RESERVED" && accountOn(second!)?.status === "RESERVED", "swap keeps both reservations");
}

async function sectionCapacityAndDelete() {
  const { parkId, accounts } = await seedPark("capacity");
  await addSection(parkId, "A", "NONE", 1, 1);
  const sectionId = (await sections(parkId))[0]?.id;
  const grown = await call(
    "POST",
    `/bikepark/${parkId}/section/${sectionId}?capacity=3&qualification=NONE&bikeTypeId=1`,
  );
  check(grown.status === 200, `grow section to 3 → ${grown.status}`);
  const titles = ((await sections(parkId))[0]?.bikeparkPlaces ?? []).map((place) => place.title).sort();
  check(titles.join(",") === "Plek: 1,Plek: 2,Plek: 3", `places are titled ${titles.join(", ")}`);

  const reserved = await reservationMatchesDomain(parkId, accounts[0]!, 1, "NONE");
  const beforeShrink = sectionsFrom(await sections(parkId));
  const section = beforeShrink[0];
  check(section !== undefined && canShrinkSection(section!, 1, 1), "domain allows shrinking while a free place remains");
  const shrunk = await call(
    "POST",
    `/bikepark/${parkId}/section/${sectionId}?capacity=2&qualification=NONE&bikeTypeId=1`,
  );
  check(shrunk.status === 200, `shrink to 2 → ${shrunk.status}`);
  const afterShrink = (await sections(parkId))[0]?.bikeparkPlaces ?? [];
  check(afterShrink.length === 2, `two places remain, got ${afterShrink.length}`);
  check(
    afterShrink.some((place) => place.id === reserved?.bikeParkPlaceId && place.status === "RESERVED"),
    "shrinking keeps the reserved place",
  );
  const removedFree = (section?.places ?? []).filter((place) => place.occupation === null && !afterShrink.some((row) => row.id === place.id));
  const newestFree = [...(section?.places ?? [])].filter((place) => place.occupation === null).sort((a, b) => a.id.localeCompare(b.id)).at(-1);
  if (removedFree.length === 1 && removedFree[0]?.id === newestFree?.id) {
    check(true, "shrink removed the newest free place");
  } else {
    note(`Java removed a different free place (${removedFree.map((place) => place.id).join(",")}); HashSet removal is allow-listed`);
  }

  const blocked = await call(
    "POST",
    `/bikepark/${parkId}/section/${sectionId}?capacity=0&qualification=NONE&bikeTypeId=1`,
  );
  const occupiedSection = sectionsFrom(await sections(parkId))[0];
  check(
    occupiedSection !== undefined && !canShrinkSection(occupiedSection!, 1, occupiedSection!.places.length),
    "domain refuses shrinking away the reserved place",
  );
  check(blocked.status !== 200, `Java refuses shrinking below the reserved place (${blocked.status})`);

  const empty = await seedPark("empty-section");
  await addSection(empty.parkId, "A", "NONE", 1, 1);
  const emptyId = (await sections(empty.parkId))[0]?.id;
  const removed = await call("DELETE", `/bikepark/${empty.parkId}/section/${emptyId}`);
  check(removed.status === 200, `delete an empty section → ${removed.status}`);
  check((await sections(empty.parkId)).length === 0, "the empty section is gone");

  const occupiedDelete = await call("DELETE", `/bikepark/${parkId}/section/${sectionId}`);
  const stillThere = sectionsFrom(await sections(parkId));
  check(stillThere[0] !== undefined && sectionHasOccupation(stillThere[0]!), "domain still sees an occupation");
  check(occupiedDelete.status !== 200 && stillThere.length === 1, `Java keeps an occupied section (${occupiedDelete.status})`);
}

async function wrongBikeTypeAndUnderSection() {
  const { parkId, accounts } = await seedPark("bikes");
  await addSection(parkId, "Elektrisch", "NONE", 1, 4);
  let domainRefused = false;
  try {
    createReservation({
      sections: sectionsFrom(await sections(parkId)),
      qualification: "NONE",
      bikeTypeId: 1,
      accountId: accounts[0]!,
      now: new Date(),
    });
  } catch {
    domainRefused = true;
  }
  const missed = await call(
    "POST",
    `/bikepark/${parkId}/reservation?bikeTypeId=1&qualification=NONE&accountId=${accounts[0]}`,
  );
  check(domainRefused && missed.status !== 201, `a normal bike does not take an electric place (Java ${missed.status})`);

  const under = await seedPark("under");
  await addSection(under.parkId, "Onder", "UNDER", 1, 1);
  const reserved = await reservationMatchesDomain(under.parkId, under.accounts[0]!, 1, "UNDER");
  check(Boolean(reserved?.bikeParkPlaceId), "UNDER takes an UNDER section");
}

async function waitingListOrder() {
  const { parkId, accounts } = await seedPark("queue");
  await addSection(parkId, "A", "NONE", 1, 1);
  for (const accountId of accounts) {
    const created = await call(
      "POST",
      `/bikepark/${parkId}/waitinglist?accountId=${accountId}&qualification=UNDER&bikeTypeId=3`,
    );
    check(created.status === 201, `waiting list ${accountId} → ${created.status}`);
  }
  const openPlaces = (await sections(parkId))[0]?.bikeparkPlaces ?? [];
  check(openPlaces.every((place) => place.status === "FREE"), "a waiting-list join leaves a different bike type free");
  let rows = extractEntries((await call("GET", `/bikepark/${parkId}/waitinglist`)).json);
  check(
    rows.map((row) => row.sequence).sort((a, b) => (a ?? 0) - (b ?? 0)).join(",") === "1,2,3",
    "waiting-list rows are numbered 1, 2, 3",
  );
  const last = rows.find((row) => row.sequence === 3);
  check(Boolean(last?.id), "the last waiting-list row has an id");
  if (!last) return;
  const moved = await call(
    "POST",
    `/bikepark/${parkId}/waitinglist/${last.id}?creationDate=${localYmd(new Date())}&qualification=UNDER&bikeTypeId=3&sequenceNumber=1`,
  );
  check(moved.status === 200, `move waiting-list row to position 1 → ${moved.status}`);
  const expected = reorderSequence(asEntries(rows), last.id, 1);
  const after = extractEntries((await call("GET", `/bikepark/${parkId}/waitinglist`)).json);
  for (const row of expected) {
    const java = after.find((entry) => entry.id === row.id);
    check(java?.sequence === row.sequenceNumber, `waiting-list ${row.accountId} sequence ${java?.sequence} = ${row.sequenceNumber}`);
  }
  const middle = after.find((row) => row.sequence === 2);
  const deleted = await call("DELETE", `/bikepark/${parkId}/waitinglist/${middle?.id}`);
  check(deleted.status === 200, `delete a waiting-list row → ${deleted.status}`);
  const left = extractEntries((await call("GET", `/bikepark/${parkId}/waitinglist`)).json).sort(
    (a, b) => (a.sequence ?? 0) - (b.sequence ?? 0),
  );
  check(left.length === 2 && left[0]?.sequence === 1 && left[1]?.sequence === 2, "delete renumbers the remaining rows from 1");
}

function asEntries(rows: { id: string; accountId: string; sequence?: number }[]): WaitingListEntry[] {
  return rows.map((row) => ({
    id: row.id,
    accountId: row.accountId,
    qualification: "UNDER",
    bikeTypeIds: [3],
    sequenceNumber: row.sequence ?? 0,
    creationDate: new Date(),
    mailingDate: new Date(),
  }));
}

async function statusClocks() {
  const { parkId, accounts } = await seedPark("clocks");
  const [holder, next] = accounts;
  await addSection(parkId, "A", "NONE", 1, 1);
  const reserved = await reservationMatchesDomain(parkId, holder!, 1, "NONE");
  const sectionId = (await sections(parkId))[0]?.id;
  const placeId = reserved?.bikeParkPlaceId;
  if (!placeId || sectionId === undefined || reserved?.expiryDate === undefined) return;
  const kept = localYmd(new Date(reserved.expiryDate));
  const occupied = await call(
    "POST",
    `/bikepark/${parkId}/${sectionId}/${placeId}/occupation?status=OCCUPIED&expiryDate=${kept}`,
  );
  const occupiedChange = changeOccupationStatus({
    occupation: {
      id: "occ",
      accountId: holder!,
      status: "RESERVED",
      expiryDate: new Date(reserved.expiryDate),
      bikeTypeId: 1,
      placeId,
    },
    next: "OCCUPIED",
    now: new Date(),
    expiryDate: new Date(reserved.expiryDate),
  });
  check(occupied.status === 200 && occupiedChange.kind === "updated", `RESERVED → OCCUPIED (Java ${occupied.status})`);
  check(
    (await sections(parkId))[0]?.bikeparkPlaces.find((place) => place.id === placeId)?.status === "OCCUPIED",
    "the place is occupied",
  );

  const cancelOn = addDays(new Date(), EXPIRY_CANCEL_DAYS);
  const cancelled = await call(
    "POST",
    `/bikepark/${parkId}/${sectionId}/${placeId}/occupation?status=CANCELLED&expiryDate=${localYmd(cancelOn)}`,
  );
  const storedCancel = sqlValue(`SELECT DATE(verloopdatum) FROM fietsenstalling_plek_bezetting WHERE account_id='${holder}'`);
  check(cancelled.status === 200 && storedCancel === localYmd(cancelOn), `cancel stores the +${EXPIRY_CANCEL_DAYS} day key-return date (${storedCancel})`);

  const returned = await call(
    "POST",
    `/bikepark/${parkId}/${sectionId}/${placeId}/occupation?status=FREE&expiryDate=${localYmd(cancelOn)}`,
  );
  check(returned.status === 200, `CANCELLED → FREE → ${returned.status}`);
  check(
    (await sections(parkId))[0]?.bikeparkPlaces.find((place) => place.id === placeId)?.status === "FREE",
    "the key return frees the place",
  );

  await reservationMatchesDomain(parkId, next!, 1, "NONE");
  const proposalAccount = id("p");
  sql(`INSERT INTO accounts (id, email, firstname, lastname) VALUES ('${proposalAccount}','${proposalAccount}@parity.test','P','1');`);
  await call("POST", `/bikepark/${parkId}/waitinglist?accountId=${proposalAccount}&qualification=NONE&bikeTypeId=1`);
  const taken = (await sections(parkId))[0]?.bikeparkPlaces.find((place) => place.status === "RESERVED");
  await call(
    "POST",
    `/bikepark/${parkId}/${sectionId}/${taken?.id}/occupation?status=FREE&expiryDate=${kept}`,
  );
  const proposed = (await sections(parkId))[0]?.bikeparkPlaces.find((place) => place.status === "PROPOSED");
  const proposalExpiry = proposed?.bikeParkOccupation?.expiryDate;
  check(Boolean(proposed) && expiryClose(proposalExpiry, Date.now()), "a freed place is proposed with +16 days");
  const acceptOn = addDays(new Date(), EXPIRY_ACCEPT_DAYS);
  const accepted = await call(
    "POST",
    `/bikepark/${parkId}/${sectionId}/${proposed?.id}/occupation?status=RESERVED&expiryDate=${localYmd(acceptOn)}`,
  );
  const storedAccept = sqlValue(
    `SELECT DATE(verloopdatum) FROM fietsenstalling_plek_bezetting WHERE account_id='${proposalAccount}'`,
  );
  check(
    accepted.status === 200 && storedAccept === localYmd(acceptOn),
    `accept stores the +${EXPIRY_ACCEPT_DAYS} day reservation date (${storedAccept})`,
  );
}

async function expiryThenOffer() {
  await fetch(`${MAIL}/reset`, { method: "POST" });
  const { parkId, accounts } = await seedPark("expire");
  const [holder, waiting] = accounts;
  await addSection(parkId, "A", "NONE", 1, 1);
  const reserved = await reservationMatchesDomain(parkId, holder!, 1, "NONE");
  await call("POST", `/bikepark/${parkId}/waitinglist?accountId=${waiting}&qualification=NONE&bikeTypeId=1`);
  sql(`UPDATE fietsenstalling_plek_bezetting SET verloopdatum='2020-01-01 00:00:00' WHERE account_id='${holder}'`);
  const expired = changeOccupationStatus({
    occupation: {
      id: "old",
      accountId: holder!,
      status: "RESERVED",
      expiryDate: new Date("2020-01-01T00:00:00Z"),
      bikeTypeId: 1,
      placeId: reserved?.bikeParkPlaceId ?? "",
    },
    next: "FREE",
    now: new Date(),
  });
  check(expired.kind === "removed" && expired.reason === "expired", "domain treats a past reservation as expired");
  const sectionId = (await sections(parkId))[0]?.id;
  const freed = await call(
    "POST",
    `/bikepark/${parkId}/${sectionId}/${reserved?.bikeParkPlaceId}/occupation?status=FREE&expiryDate=2020-01-01`,
  );
  check(freed.status === 200, `expire the reservation → ${freed.status}`);
  const proposed = (await sections(parkId))[0]?.bikeparkPlaces.find((place) => place.status === "PROPOSED");
  check(proposed?.bikeParkOccupation?.accountHolder?.id === waiting, "expiry offers the place to the waiting list");
  const mails = (await (await fetch(`${MAIL}/mails`)).json()) as { accountId: string }[];
  check(
    mails.some((mail) => mail.accountId === holder),
    "expiry posts a mail to the account whose reservation lapsed",
  );
}

async function declineProposal() {
  await fetch(`${MAIL}/reset`, { method: "POST" });
  const { parkId, accounts } = await seedPark("decline");
  const [holder, waiting] = accounts;
  await addSection(parkId, "A", "NONE", 1, 1);
  const reserved = await reservationMatchesDomain(parkId, holder!, 1, "NONE");
  await call("POST", `/bikepark/${parkId}/waitinglist?accountId=${waiting}&qualification=NONE&bikeTypeId=1`);
  const sectionId = (await sections(parkId))[0]?.id;
  await call(
    "POST",
    `/bikepark/${parkId}/${sectionId}/${reserved?.bikeParkPlaceId}/occupation?status=FREE&expiryDate=${localYmd(addDays(new Date(), EXPIRY_RESERVATION_DAYS))}`,
  );
  const proposed = (await sections(parkId))[0]?.bikeparkPlaces.find((place) => place.status === "PROPOSED");
  const decision = changeOccupationStatus({
    occupation: {
      id: proposed?.bikeParkOccupation?.id ?? "p",
      accountId: waiting!,
      status: "PROPOSED",
      expiryDate: new Date(proposed?.bikeParkOccupation?.expiryDate ?? Date.now()),
      bikeTypeId: 1,
      placeId: proposed?.id ?? "",
    },
    next: "FREE",
    now: new Date(),
  });
  check(decision.kind === "removed" && decision.reason === "declined", "domain treats freeing a current proposal as a decline");
  const declined = await call(
    "POST",
    `/bikepark/${parkId}/${sectionId}/${proposed?.id}/occupation?status=FREE&expiryDate=${localYmd(new Date())}`,
  );
  check(declined.status === 200, `decline the proposal → ${declined.status}`);
  check(
    (await sections(parkId))[0]?.bikeparkPlaces.every((place) => place.status === "FREE"),
    "a declined proposal leaves the place free",
  );
  const mails = (await (await fetch(`${MAIL}/mails`)).json()) as { accountId: string }[];
  check(mails.some((mail) => mail.accountId === waiting), "decline posts a mail to the account that was offered the place");
}

async function underRequestMatchesNoneSection() {
  const { parkId, accounts } = await seedPark("none-rack");
  await addSection(parkId, "Gemengd", "NONE", 1, 4);
  const reserved = await reservationMatchesDomain(parkId, accounts[0]!, 4, "UNDER");
  check(Boolean(reserved?.bikeParkPlaceId), "UNDER still takes a NONE section of the same bike type");
}

async function reservationMail() {
  await fetch(`${MAIL}/reset`, { method: "POST" });
  const { parkId, accounts } = await seedPark("mail");
  await addSection(parkId, "A", "NONE", 1, 1);
  await call("POST", `/bikepark/${parkId}/reservation?bikeTypeId=1&qualification=NONE&accountId=${accounts[0]}`);
  const response = await fetch(`${MAIL}/mails`);
  const mails = (await response.json()) as { accountId: string; bikeparkId: string }[];
  const hit = mails.find((mail) => mail.accountId === accounts[0] && mail.bikeparkId === parkId);
  check(Boolean(hit), "reservation posts a mail for that account and stalling");
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
