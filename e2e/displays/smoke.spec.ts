import { test, expect } from "@playwright/test";

test.describe("External displays (smoke)", () => {
  test("display static assets are served", async ({ request }) => {
    const vs = await request.get("/display/verwijssysteem/styles.css");
    expect(vs.status()).toBe(200);
    const pr = await request.get("/display/presentaties/styles.css");
    expect(pr.status()).toBe(200);
  });

  test("display occupancy data requires site or bikepark", async ({ request }) => {
    const res = await request.get("/api/display/verwijssysteem/data");
    expect(res.status()).toBe(400);
  });

  test("verwijssysteem HTML when database is available", async ({ request }) => {
    const res = await request.get("/api/display/verwijssysteem/");
    test.skip(res.status() !== 200, "Database not available in this environment");
    const html = await res.text();
    expect(html).toContain("Verwijssysteem");
  });
});
