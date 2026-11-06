import { DOC_STANDARD, OCCUPANT_EMAIL, SECOND_EMAIL, SHORT_A, SHORT_B, SHORT_TROMMEL, WAITER_EMAIL, citizen } from "./fixture";
import { expect, test } from "./test";
import { openFacility, paidSubscriptions, parseCsv, readDownload, reserveForCustomer, workspace } from "./ui";

test.describe("viewer", () => {
  test.use({ storageState: "e2e/buurtstallingen/.auth/viewer.json" });

  test("sees the menu item and a read-only workspace", async ({ page }) => {
    const modules = page.waitForResponse((response) => response.url().includes("/api/protected/modules_contacts"));
    await page.goto("/beheer/buurtstallingen");
    await modules;
    await page.getByRole("navigation", { name: "Hoofdmenu" }).getByRole("button", { name: "Buurtstallingen / fietstrommels" }).click();
    const box = workspace(page);
    await expect(box.getByRole("heading", { name: "Onder (UNDER)" })).toBeVisible();
    await expect(box.getByText("E2E Bezet")).toBeVisible();
    await expect(box.getByRole("heading", { name: "Wachtlijst" })).toBeVisible();
    await expect(box.getByText("Reserveer voor klant")).toHaveCount(0);
    await expect(box.getByRole("button", { name: "Wissel" })).toHaveCount(0);
    await expect(box.getByRole("button", { name: "Verwijder plek" })).toHaveCount(0);
    await expect(box.getByRole("button", { name: "Sleutel opgehaald" })).toHaveCount(0);
    await expect(box.getByRole("button", { name: "Sleutel ingeleverd" })).toHaveCount(0);
    await expect(box.getByRole("button", { name: "Opzeggen" })).toHaveCount(0);

    await box.getByRole("button", { name: "Fietstrommels", exact: true }).click();
    await expect(box.getByText(WAITER_EMAIL)).toBeVisible();

    await box.getByRole("button", { name: "Verlopen opzeggingen" }).click();
    await expect(box.getByText("Geen verlopen opzeggingen.")).toBeVisible();
    await expect(box.getByRole("button", { name: "Sleutel ingenomen" })).toHaveCount(0);

    await box.getByRole("button", { name: "Export", exact: true }).click();
    await expect(box.getByText("Wachtlijst", { exact: true })).toHaveCount(0);
    const refused = await page.request.get("/api/protected/buurtstallingen?export=wachtlijst&type=fietstrommel");
    expect(refused.status()).toBe(403);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      box.getByRole("link", { name: "Maandrapport (CSV)" }).click(),
    ]);
    const text = await readDownload(download);
    const rows = parseCsv(text);
    const buurt = rows.find((row) => row.includes(SHORT_A));
    const trommel = rows.find((row) => row.includes(SHORT_TROMMEL));
    expect(text).toContain(SHORT_A);
    expect(buurt?.[4]).toBe("3");
    expect(buurt?.[5]).toBe("0");
    expect(trommel?.[4]).toBe("1");
    expect(trommel?.[5]).toBe("0");
    expect(trommel?.[9]).toBe("1");
    expect(rows.some((row) => row[0] === SHORT_B)).toBe(false);
  });
});

test.describe("without access", () => {
  test.use({ storageState: "e2e/buurtstallingen/.auth/none.json" });

  test("a user without the topic does not see the menu item", async ({ page }) => {
    const modules = page.waitForResponse((response) => response.url().includes("/api/protected/modules_contacts"));
    await page.goto("/beheer/buurtstallingen");
    await modules;
    await expect(page.getByRole("button", { name: "Buurtstallingen / fietstrommels" })).toHaveCount(0);
  });
});

test.describe("without the module", () => {
  test.use({ storageState: "e2e/buurtstallingen/.auth/nomodule.json" });

  test("a viewer of an organisation without the module does not see the menu item", async ({ page }) => {
    const modules = page.waitForResponse((response) => response.url().includes("/api/protected/modules_contacts"));
    await page.goto("/beheer/buurtstallingen");
    await modules;
    await expect(page.getByRole("button", { name: "Buurtstallingen / fietstrommels" })).toHaveCount(0);
  });
});

test.describe("admin", () => {
  test.use({ storageState: "e2e/buurtstallingen/.auth/admin.json" });

  test("marks a reserved place occupied and the subscription is paid", async ({ page }) => {
    await openFacility(page, "buurtstalling");
    await reserveForCustomer(page, citizen.email);
    const box = workspace(page);
    await expect(box.getByRole("row", { name: /E2E Citizen/ }).getByText("Gereserveerd")).toBeVisible();
    await box.getByRole("button", { name: "Sleutel opgehaald" }).click();
    await expect(box.getByRole("row", { name: /E2E Citizen/ }).getByText("Bezet")).toBeVisible();
    expect(await paidSubscriptions(citizen.id)).toBe(1);
    await expect(box.getByRole("button", { name: "Verwijder plek" })).toHaveCount(0);
  });

  test("swaps two occupied places and the names follow", async ({ page }) => {
    await openFacility(page, "buurtstalling");
    const box = workspace(page);
    const idOf = async (name: string) => {
      const row = box.getByRole("row", { name: new RegExp(name) });
      return (await row.locator("td").first().locator("div").innerText()).trim();
    };
    const bezetId = await idOf("E2E Bezet");
    const tweedeId = await idOf("E2E Tweede");
    await box.getByPlaceholder("plek-id").nth(0).fill(bezetId);
    await box.getByPlaceholder("plek-id").nth(1).fill(tweedeId);
    await box.getByRole("button", { name: "Wissel" }).click();
    await expect(box.locator("tr", { hasText: bezetId }).getByText("E2E Tweede")).toBeVisible();
    await expect(box.locator("tr", { hasText: tweedeId }).getByText("E2E Bezet")).toBeVisible();
  });

  test("reserves a place for an existing customer", async ({ page }) => {
    await openFacility(page, "buurtstalling");
    await reserveForCustomer(page, citizen.email);
    await expect(workspace(page).getByRole("row", { name: /E2E Citizen/ })).toContainText("Gereserveerd");
  });

  test("downloads waiting-list and occupant files for this gemeente only", async ({ page }) => {
    await page.goto("/beheer/buurtstallingen");
    const box = workspace(page);
    await box.getByRole("button", { name: "Export", exact: true }).click();
    const [waitingDownload] = await Promise.all([
      page.waitForEvent("download"),
      box.getByRole("link", { name: "Fietstrommels" }).first().click(),
    ]);
    const waiting = await readDownload(waitingDownload);
    expect(waiting).toContain(WAITER_EMAIL);
    expect(waiting).toContain("Wacht");
    expect(waiting).not.toContain(SHORT_B);
    expect(waiting).not.toContain("E2E Stalling B");

    const [occupantDownload] = await Promise.all([
      page.waitForEvent("download"),
      box.getByRole("link", { name: "Buurtstallingen" }).nth(1).click(),
    ]);
    const occupants = await readDownload(occupantDownload);
    expect(occupants).toContain(OCCUPANT_EMAIL);
    expect(occupants).toContain("E2E Bezet");
    expect(occupants).toContain(SECOND_EMAIL);
    expect(occupants).toContain("E2E Tweede");
    expect(occupants).not.toContain(SHORT_B);
    expect(occupants).not.toContain("E2E Stalling B");
  });

  test("creates a document, links it, and blocks delete of a linked or standard document", async ({ page }) => {
    await page.goto("/beheer/documents");
    await page.getByRole("button", { name: "Nieuw document" }).click();
    await page.getByPlaceholder("Naam").fill("E2E contract e2e");
    await page.getByRole("button", { name: "{account.voornaam}" }).click();
    await page.getByRole("button", { name: "Opslaan" }).click();
    await expect(page.locator("textarea")).toHaveValue(/\{account\.voornaam\}/);

    await page.getByRole("button", { name: "Nieuw document" }).click();
    await page.getByPlaceholder("Naam").fill("E2E machtiging e2e");
    await page.getByRole("button", { name: "Opslaan" }).click();
    await expect(page.getByRole("button", { name: "E2E machtiging e2e" })).toBeVisible();

    await page.goto("/beheer/abonnementsvormen");
    await page.getByRole("button", { name: "Nieuwe abonnementsvorm" }).click();
    const form = page.locator("form").filter({ has: page.getByRole("heading", { name: "Nieuwe abonnementsvorm" }) });
    const field = (label: string) => form.locator("label", { hasText: label }).locator("xpath=..");
    const naam = form.locator("input[type='text']").first();
    await expect(async () => {
      await naam.fill("E2E vorm e2e");
      await page.waitForTimeout(400);
      await expect(naam).toHaveValue("E2E vorm e2e");
    }).toPass();
    await field("Stallingstype:").locator("select").selectOption("buurtstalling");
    await field("Tijdsduur abonnement:").locator("input").fill("12");
    await field("Prijs:").locator("input").fill("9");
    await form.getByRole("checkbox", { name: "Fietsen", exact: true }).check();
    await expect(form.getByText("Contract:", { exact: true })).toBeVisible();
    await field("Contract:").locator("select").selectOption({ label: "E2E contract e2e" });
    await field("Machtiging:").locator("select").selectOption({ label: "E2E machtiging e2e" });
    await form.getByRole("button", { name: "Opslaan" }).click();
    await expect(page.getByText("E2E vorm e2e")).toBeVisible();

    await page.goto("/beheer/documents");
    await page.getByRole("button", { name: "E2E contract e2e" }).click();
    await page.getByRole("button", { name: "Verwijder" }).click();
    await expect(page.getByText("Dit document is nog gekoppeld aan een abonnementsvorm")).toBeVisible();
    await expect(page.getByRole("button", { name: "E2E contract e2e" })).toBeVisible();

    await page.getByRole("button", { name: "Nieuw document" }).click();
    await page.getByPlaceholder("Naam").fill("E2E los document");
    await page.getByRole("button", { name: "Opslaan" }).click();
    await page.getByRole("button", { name: "Verwijder" }).click();
    await expect(page.getByRole("button", { name: "E2E los document" })).toHaveCount(0);

    const standard = page.locator("li", { hasText: "E2E standaard" });
    await expect(standard.getByRole("button", { name: "Kopieer" })).toBeVisible();
    await expect(standard.getByRole("button", { name: "E2E standaard" })).toHaveCount(0);
    const put = await page.request.put(`/api/protected/documenttemplates/${DOC_STANDARD}`, {
      data: { name: "E2E standaard", html: "<p>gewijzigd</p>" },
    });
    expect(put.status()).toBe(403);
  });
});

test.describe("rootadmin", () => {
  test.use({ storageState: "e2e/buurtstallingen/.auth/rootadmin.json" });

  test("deletes a free place", async ({ page }) => {
    await openFacility(page, "buurtstalling");
    const onder = workspace(page).locator("section", { has: page.getByRole("heading", { name: "Onder (UNDER)" }) });
    await onder.getByRole("button", { name: "Verwijder plek" }).click();
    await expect(onder.getByText("Plek: 1")).toHaveCount(0);
  });
});
