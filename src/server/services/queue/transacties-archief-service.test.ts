import assert from "node:assert/strict";
import test from "node:test";
import { Decimal } from "@prisma/client/runtime/library";
import {
  ARCHIEF_SOURCE_V4_MANAGED,
  deleteManagedTransactiesArchief,
  toArchiefCheckType,
  toArchiefPrice,
  writeTransactiesArchiefFromManaged,
  type WriteTransactiesArchiefInput,
} from "./transacties-archief-service";

type ArchiefRow = {
  ID: number;
  locationid: string;
  externaltransactionid: string | null;
  price: Decimal;
  checkoutdate: Date;
  source: string;
  checkintype: string;
  daybeginsat: Date;
};

function memoryDb() {
  const rows: ArchiefRow[] = [];
  let nextId = 1;
  const db = {
    contacts: {
      findFirst: async () => ({ DayBeginsAt: new Date(1970, 0, 1, 4, 0, 0) }),
    },
    transacties_archief: {
      findFirst: async ({
        where,
      }: {
        where: { locationid: string; externaltransactionid: string };
      }) =>
        rows.find(
          (row) =>
            row.locationid === where.locationid &&
            row.externaltransactionid === where.externaltransactionid
        ) ?? null,
      create: async ({ data }: { data: Omit<ArchiefRow, "ID"> & { externaltransactionid: string | null } }) => {
        const row = { ...data, ID: nextId++ } as ArchiefRow;
        rows.push(row);
        return row;
      },
      update: async ({ where, data }: { where: { ID: number }; data: Partial<ArchiefRow> }) => {
        const row = rows.find((item) => item.ID === where.ID);
        if (!row) throw new Error("missing row");
        Object.assign(row, data);
        return row;
      },
      deleteMany: async ({
        where,
      }: {
        where: { locationid: string; externaltransactionid: string };
      }) => {
        const before = rows.length;
        for (let i = rows.length - 1; i >= 0; i--) {
          const row = rows[i];
          if (
            row &&
            row.locationid === where.locationid &&
            row.externaltransactionid === where.externaltransactionid
          ) {
            rows.splice(i, 1);
          }
        }
        return { count: before - rows.length };
      },
    },
  };
  return { db, rows };
}

function visit(overrides: Partial<WriteTransactiesArchiefInput> = {}): WriteTransactiesArchiefInput {
  return {
    citycode: "9933",
    locationid: "9933_001",
    sectionid: "9933_001_1",
    checkindate: new Date("2026-10-27T08:00:00.000Z"),
    checkoutdate: new Date("2026-10-27T08:30:00.000Z"),
    checkintype: "user",
    checkouttype: "user",
    price: 1.5,
    clienttypeid: 1,
    biketypeid: 1,
    source: ARCHIEF_SOURCE_V4_MANAGED,
    externaltransactionid: "ext-9933-1",
    daybeginsat: new Date(1970, 0, 1, 0, 0, 0),
    ...overrides,
  };
}

test("check types outside the archief enum fall back to user", () => {
  assert.equal(toArchiefCheckType("sync"), "sync");
  assert.equal(toArchiefCheckType(" CONTROLE "), "controle");
  assert.equal(toArchiefCheckType("operator"), "user");
  assert.equal(toArchiefCheckType(null, "system"), "system");
});

test("stallingskosten maps onto the archief price", () => {
  assert.equal(toArchiefPrice(null).toFixed(2), "0.00");
  assert.equal(toArchiefPrice("2.50").toFixed(2), "2.50");
  assert.equal(toArchiefPrice(new Decimal("3.1")).toFixed(2), "3.10");
});

test("a managed resend updates the same archief row", async () => {
  const { db, rows } = memoryDb();
  const first = await writeTransactiesArchiefFromManaged(db as never, visit({ price: 1.5 }));
  const later = new Date("2026-10-27T09:00:00.000Z");
  const second = await writeTransactiesArchiefFromManaged(
    db as never,
    visit({ price: 2, checkoutdate: later })
  );

  assert.equal(first.created, true);
  assert.equal(second.created, false);
  assert.equal(second.id, first.id);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.price.toFixed(2), "2.00");
  assert.equal(rows[0]?.checkoutdate.toISOString(), later.toISOString());
  assert.equal(rows[0]?.source, ARCHIEF_SOURCE_V4_MANAGED);
});

test("two external ids at the same stalling stay two rows", async () => {
  const { db, rows } = memoryDb();
  await writeTransactiesArchiefFromManaged(db as never, visit({ externaltransactionid: "a" }));
  await writeTransactiesArchiefFromManaged(db as never, visit({ externaltransactionid: "b" }));
  assert.equal(rows.length, 2);
});

test("completed transactions without an external id insert each time", async () => {
  const { db, rows } = memoryDb();
  const input = visit({ externaltransactionid: null, source: "fms-v3-api" });
  const first = await writeTransactiesArchiefFromManaged(db as never, input);
  const second = await writeTransactiesArchiefFromManaged(db as never, input);
  assert.equal(first.created, true);
  assert.equal(second.created, true);
  assert.equal(rows.length, 2);
});

test("reopening a managed visit removes its archief row", async () => {
  const { db, rows } = memoryDb();
  await writeTransactiesArchiefFromManaged(db as never, visit());
  const removed = await deleteManagedTransactiesArchief(db as never, "9933_001", "ext-9933-1");
  assert.equal(removed, 1);
  assert.equal(rows.length, 0);
});

test("daybeginsat comes from the organisation when the caller does not pass one", async () => {
  const { db, rows } = memoryDb();
  const input = visit();
  delete input.daybeginsat;
  await writeTransactiesArchiefFromManaged(db as never, input);
  assert.equal(rows[0]?.daybeginsat.getHours(), 4);
  assert.equal(rows[0]?.daybeginsat.getMinutes(), 0);
});
