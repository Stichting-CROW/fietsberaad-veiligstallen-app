import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  btwOfAmount,
  deficitOverboekingen,
  OVERBOEKEN_CATCH_UP_SQL,
  overboekenCronGate,
  positiveOverboekingen,
  runCatchUpRows,
  type ExploitantSaldoRow,
} from "./overboeken";

const day = (iso: string) => new Date(iso);

function row(partial: Partial<ExploitantSaldoRow> & Pick<ExploitantSaldoRow, "exploitantID" | "stallingstegoed">): ExploitantSaldoRow {
  return {
    siteID: partial.siteID ?? "gemeente",
    exploitantID: partial.exploitantID,
    stallingstegoed: partial.stallingstegoed,
    dateLastTransaction: partial.dateLastTransaction ?? null,
  };
}

describe("btwOfAmount", () => {
  it("follows getBTW and Round(amount * 100) / 100", () => {
    assert.equal(btwOfAmount(121), 21);
    assert.equal(btwOfAmount(10), 1.74);
    assert.equal(btwOfAmount(-10), -1.74);
    assert.equal(btwOfAmount(0), 0);
    assert.equal(btwOfAmount(0.5), 0.09);
    assert.equal(btwOfAmount(-0.5), -0.09);
  });
});

describe("positiveOverboekingen", () => {
  it("books each surplus to Fietsberaad and keeps the query order", () => {
    const bookings = positiveOverboekingen([
      row({ exploitantID: "op-a", stallingstegoed: 4, dateLastTransaction: day("2026-01-02") }),
      row({ exploitantID: "op-b", stallingstegoed: -3 }),
      row({ exploitantID: "op-c", stallingstegoed: 0 }),
      row({ exploitantID: "op-d", stallingstegoed: 1.5, siteID: "other", dateLastTransaction: day("2026-03-01") }),
    ]);
    assert.deepEqual(
      bookings.map((booking) => ({
        amount: booking.amount,
        sourceSiteID: booking.sourceSiteID,
        targetSiteID: booking.targetSiteID,
        siteID: booking.siteID,
        btw: booking.btw,
        btwPercentage: booking.btwPercentage,
        code: booking.code,
        status: booking.status,
      })),
      [
        { amount: -4, sourceSiteID: "op-a", targetSiteID: "1", siteID: "gemeente", btw: btwOfAmount(-4), btwPercentage: 21, code: "overboeking", status: "ok" },
        { amount: -1.5, sourceSiteID: "op-d", targetSiteID: "1", siteID: "other", btw: btwOfAmount(-1.5), btwPercentage: 21, code: "overboeking", status: "ok" },
      ],
    );
    assert.deepEqual(Object.keys(bookings[0] ?? {}).sort(), [
      "amount",
      "btw",
      "btwPercentage",
      "code",
      "siteID",
      "sourceSiteID",
      "status",
      "targetSiteID",
    ]);
  });
});

describe("deficitOverboekingen", () => {
  const deficits = [
    row({ exploitantID: "older", stallingstegoed: -2, dateLastTransaction: day("2026-01-01") }),
    row({ exploitantID: "newest", stallingstegoed: -8, dateLastTransaction: day("2026-03-01") }),
    row({ exploitantID: "middle", stallingstegoed: -3, dateLastTransaction: day("2026-02-01") }),
    row({ exploitantID: "undated", stallingstegoed: -1, dateLastTransaction: null }),
  ];

  it("books nothing when the Fietsberaad credit is not above zero", () => {
    assert.deepEqual(deficitOverboekingen(deficits, 0), []);
    assert.deepEqual(deficitOverboekingen(deficits, -5), []);
  });

  it("skips a deficit the credit cannot cover and still books a later smaller one", () => {
    const bookings = deficitOverboekingen(deficits, 5);
    assert.deepEqual(
      bookings.map((booking) => [booking.sourceSiteID, booking.amount, booking.targetSiteID]),
      [
        ["middle", 3, "1"],
        ["older", 2, "1"],
      ],
    );
  });

  it("books a deficit that equals the remaining credit and skips one cent short", () => {
    const exact = deficitOverboekingen(
      [row({ exploitantID: "exact", stallingstegoed: -2.5, dateLastTransaction: day("2026-04-01") })],
      2.5,
    );
    assert.equal(exact.length, 1);
    assert.equal(exact[0]?.amount, 2.5);
    assert.equal(exact[0]?.sourceSiteID, "exact");
    assert.deepEqual(
      deficitOverboekingen(
        [row({ exploitantID: "short", stallingstegoed: -2.5, dateLastTransaction: day("2026-04-01") })],
        2.49,
      ),
      [],
    );
  });

  it("reduces the credit by each booked deficit before the next row", () => {
    const rows = [
      row({ exploitantID: "newest", stallingstegoed: -4, dateLastTransaction: day("2026-06-02") }),
      row({ exploitantID: "older", stallingstegoed: -3, dateLastTransaction: day("2026-06-01") }),
    ];
    assert.deepEqual(
      deficitOverboekingen(rows, 5).map((booking) => booking.sourceSiteID),
      ["newest"],
    );
    assert.deepEqual(
      deficitOverboekingen(rows, 7).map((booking) => booking.sourceSiteID),
      ["newest", "older"],
    );
  });

  it("keeps input order when dateLastTransaction is equal and sorts a null date last", () => {
    const same = day("2026-07-01");
    const bookings = deficitOverboekingen(
      [
        row({ exploitantID: "undated", stallingstegoed: -1, dateLastTransaction: null }),
        row({ exploitantID: "second", stallingstegoed: -1, dateLastTransaction: same }),
        row({ exploitantID: "first", stallingstegoed: -1, dateLastTransaction: same }),
      ],
      10,
    );
    assert.deepEqual(
      bookings.map((booking) => booking.sourceSiteID),
      ["second", "first", "undated"],
    );
  });

  it("uses the supplied credit and does not add surplus rows into it", () => {
    const rows = [
      row({ exploitantID: "surplus", stallingstegoed: 10, dateLastTransaction: day("2026-05-01") }),
      row({ exploitantID: "short", stallingstegoed: -4, dateLastTransaction: day("2026-05-02") }),
    ];
    assert.deepEqual(deficitOverboekingen(rows, 0), []);
    assert.equal(deficitOverboekingen(rows, 10)[0]?.sourceSiteID, "short");
    assert.equal(deficitOverboekingen(rows, 10)[0]?.amount, 4);
  });

  it("never sets the source to Fietsberaad", () => {
    const bookings = deficitOverboekingen(deficits, 100);
    assert.ok(bookings.every((booking) => booking.sourceSiteID !== "1" && booking.targetSiteID === "1"));
    assert.deepEqual(
      bookings.map((booking) => booking.sourceSiteID),
      ["newest", "middle", "older", "undated"],
    );
  });
});

describe("overboeken catch-up", () => {
  it("uses the overboeken.cfm selection", () => {
    const sql = (text: string) => text.replace(/`/g, "").replace(/\s+/g, " ").trim().toLowerCase();
    assert.equal(
      sql(OVERBOEKEN_CATCH_UP_SQL),
      sql("SELECT accountID FROM vw_stallingstegoedenexploitant WHERE stallingstegoed != 0 ORDER BY dateLastTransaction DESC LIMIT 10"),
    );
  });

  it("settles each selected id in order, including a repeat", async () => {
    const settled: string[] = [];
    const result = await runCatchUpRows(
      [{ accountID: "a" }, { accountID: "b" }, { accountID: "a" }],
      async () => true,
      async (accountId) => {
        settled.push(accountId);
      },
    );
    assert.deepEqual(settled, ["a", "b", "a"]);
    assert.deepEqual(result, { processed: ["a", "b", "a"], skipped: [], errors: [] });
  });

  it("skips an empty id and a missing account, then settles the next row", async () => {
    const settled: string[] = [];
    const result = await runCatchUpRows(
      [{ accountID: null }, { accountID: "" }, { accountID: "gone" }, { accountID: "kept" }],
      async (accountId) => accountId !== "gone",
      async (accountId) => {
        settled.push(accountId);
      },
    );
    assert.deepEqual(settled, ["kept"]);
    assert.deepEqual(result.processed, ["kept"]);
    assert.deepEqual(result.skipped, ["", "", "gone"]);
    assert.deepEqual(result.errors, []);
  });

  it("records a thrown settlement and continues with the next account", async () => {
    const result = await runCatchUpRows(
      [{ accountID: "bad" }, { accountID: "good" }],
      async () => true,
      async (accountId) => {
        if (accountId === "bad") throw new Error("view down");
      },
    );
    assert.deepEqual(result.processed, ["good"]);
    assert.deepEqual(result.errors, [{ accountId: "bad", message: "view down" }]);
  });

  it("records a thrown existence check and continues", async () => {
    const result = await runCatchUpRows(
      [{ accountID: "bad" }, { accountID: "good" }],
      async (accountId) => {
        if (accountId === "bad") throw new Error("lookup failed");
        return true;
      },
      async () => undefined,
    );
    assert.deepEqual(result.processed, ["good"]);
    assert.deepEqual(result.errors, [{ accountId: "bad", message: "lookup failed" }]);
  });
});

describe("overboekenCronGate", () => {
  const enabled = { cronSecret: "secret", enabled: "1" };

  it("allows GET and POST only after the bearer secret, then requires the enable flag", () => {
    assert.deepEqual(overboekenCronGate({ method: "PUT", authorization: "Bearer secret", ...enabled }), { kind: "method", status: 405 });
    assert.deepEqual(overboekenCronGate({ method: "POST", authorization: undefined, ...enabled }), { kind: "unauthorized", status: 401 });
    assert.deepEqual(overboekenCronGate({ method: "POST", authorization: "secret", ...enabled }), { kind: "unauthorized", status: 401 });
    assert.deepEqual(overboekenCronGate({ method: "POST", authorization: "Bearer other", ...enabled }), { kind: "unauthorized", status: 401 });
    assert.deepEqual(overboekenCronGate({ method: "GET", authorization: "Bearer secret", cronSecret: "secret", enabled: undefined }), { kind: "disabled" });
    assert.deepEqual(overboekenCronGate({ method: "GET", authorization: "Bearer secret", cronSecret: "secret", enabled: "true" }), { kind: "disabled" });
    assert.deepEqual(overboekenCronGate({ method: "POST", authorization: "Bearer secret", ...enabled }), { kind: "run" });
    assert.deepEqual(overboekenCronGate({ method: "GET", authorization: "Bearer secret", ...enabled }), { kind: "run" });
  });

  it("allows the call when CRON_SECRET is unset, and still requires the enable flag", () => {
    assert.deepEqual(overboekenCronGate({ method: "POST", authorization: undefined, cronSecret: undefined, enabled: "1" }), { kind: "run" });
    assert.deepEqual(overboekenCronGate({ method: "POST", authorization: undefined, cronSecret: "", enabled: "1" }), { kind: "run" });
    assert.deepEqual(overboekenCronGate({ method: "POST", authorization: undefined, cronSecret: undefined, enabled: undefined }), { kind: "disabled" });
  });
});
