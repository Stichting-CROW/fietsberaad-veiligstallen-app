import type { Page } from "@playwright/test";
import { EXPLOITANT_EMAIL, PASSWORD, SITE_A, STALL_A, STALL_TROMMEL, URL_A, URL_B, WAITER_EMAIL, citizen } from "./fixture";
import { expect, test } from "./test";
import { clearMail, openFacility, waitForCapturedMail, workspace } from "./ui";

async function loginCitizen(page: Page) {
  const response = await page.request.post("/api/account/session", {
    data: { email: citizen.email, password: PASSWORD },
  });
  expect(response.ok()).toBeTruthy();
}

function accountWizard(parkingId: string, wizard: string, extra = "") {
  const qs = new URLSearchParams({ siteId: SITE_A, parkingId, wizard });
  if (extra) {
    for (const part of extra.replace(/^\?/, "").split("&")) {
      const [key, value] = part.split("=");
      if (key && value) qs.set(key, value);
    }
  }
  return `/account/abonnement?${qs.toString()}`;
}

test("anonymous visitor sees the free count and cannot open Mijn stalling", async ({ page }) => {
  await page.goto(`/${URL_A}/buurtstallingen`);
  await expect(page.getByText("1 vrije plekken")).toBeVisible();
  await page.getByRole("link", { name: "Mijn stalling" }).click();
  await expect(page.getByText("Log in via een buurtstalling om uw plekken te zien.")).toBeVisible();
  await page.goto(`/${URL_A}/buurtstallingen/${STALL_A}`);
  await expect(page).toHaveURL(/\/account\/login\?next=/);
});

test("logged-in citizen gets 404 for another municipality's stalling", async ({ page }) => {
  await loginCitizen(page);
  const other = await page.goto(`/${URL_B}/buurtstallingen/${STALL_A}`);
  expect(other?.status()).toBe(404);
});

test("citizen reserves a free place and the exploitant is copied on the mail", async ({ page }) => {
  clearMail();
  await loginCitizen(page);
  await page.goto(accountWizard(STALL_A, "gegevens", "fiets=1&rek=NONE"));
  await page.locator("main").getByRole("button", { name: "Reserveer een plek" }).click();
  await expect(page.getByText(/Uw plek is gereserveerd/)).toBeVisible();
  const mail = await waitForCapturedMail((item) => item.subject === "Reservering plek buurtstalling/fietstrommel");
  expect(mail.to).toBe(citizen.email);
  expect(mail.cc).toBe(EXPLOITANT_EMAIL);

  const other = await page.goto(`/${URL_B}/buurtstallingen/${STALL_A}`);
  expect(other?.status()).toBe(404);
});

test("a full fietstrommel offers only the waiting list and skips the rek step", async ({ page }) => {
  await loginCitizen(page);
  await page.goto(accountWizard(STALL_TROMMEL, "fiets"));
  await expect(page.getByText("Plaats mij op de wachtlijst")).toBeVisible();
  await expect(page.getByRole("listitem", { name: "Rek" })).toHaveCount(0);
  await page.goto(accountWizard(STALL_TROMMEL, "rek", "fiets=1"));
  await expect(page).toHaveURL(/wizard=gegevens/);
  await page.locator("main").getByRole("button", { name: "Op de wachtlijst" }).click();
  await expect(page.getByText(/U staat op plaats \d+ van de wachtlijst/)).toBeVisible();
});

test("Mijn stalling lists only this citizen", async ({ page }) => {
  await loginCitizen(page);
  await page.goto(accountWizard(STALL_A, "gegevens", "fiets=1&rek=NONE"));
  await page.locator("main").getByRole("button", { name: "Reserveer een plek" }).click();
  await expect(page.getByText(/Uw plek is gereserveerd/)).toBeVisible();
  await page.goto(accountWizard(STALL_TROMMEL, "gegevens", "fiets=1"));
  await page.locator("main").getByRole("button", { name: "Op de wachtlijst" }).click();
  await expect(page.getByText(/U staat op plaats \d+ van de wachtlijst/)).toBeVisible();
  await page.goto(`/${URL_A}/mijn-stalling`);
  await expect(page.getByText("E2E Buurtstalling")).toBeVisible();
  await expect(page.getByText("E2E Fietstrommel")).toBeVisible();
  await expect(page.getByText("E2E Stalling B")).toHaveCount(0);
  await expect(page.getByText(WAITER_EMAIL)).toHaveCount(0);
  await expect(page.getByText("E2E Bezet")).toHaveCount(0);
});

async function confirm(page: Page, button: string, message: string) {
  const dialogPromise = page.waitForEvent("dialog");
  const clickPromise = page.getByRole("button", { name: button, exact: true }).click();
  const dialog = await dialogPromise;
  expect(dialog.message()).toBe(message);
  await dialog.accept();
  await clickPromise;
}

async function proposeToCitizen(admin: Page, citizenPage: Page) {
  clearMail();
  await openFacility(admin, "fietstrommel");
  await workspace(admin).getByRole("button", { name: "Verwijder", exact: true }).click();
  await expect(workspace(admin).getByText(WAITER_EMAIL)).toHaveCount(0);
  await loginCitizen(citizenPage);
  await citizenPage.goto(accountWizard(STALL_TROMMEL, "gegevens", "fiets=1"));
  await citizenPage.locator("main").getByRole("button", { name: "Op de wachtlijst" }).click();
  await expect(citizenPage.getByText("U staat op plaats 1 van de wachtlijst")).toBeVisible();
  await openFacility(admin, "fietstrommel");
  await workspace(admin).getByRole("button", { name: "Sleutel ingeleverd" }).click();
  await expect(workspace(admin).getByText("Voorstel verstuurd")).toBeVisible();
}

test("leaving the waiting list asks for confirmation and removes the row", async ({ page }) => {
  await loginCitizen(page);
  await page.goto(accountWizard(STALL_TROMMEL, "gegevens", "fiets=1"));
  await page.locator("main").getByRole("button", { name: "Op de wachtlijst" }).click();
  await expect(page.getByText(/U staat op plaats \d+ van de wachtlijst/)).toBeVisible();
  await page.goto(`/${URL_A}/mijn-stalling`);
  await expect(page.getByText("E2E Fietstrommel")).toBeVisible();
  await confirm(page, "Afmelden", "Van de wachtlijst af?");
  await expect(page.getByText("E2E Fietstrommel")).toHaveCount(0);
});

test.describe("proposals and cancellation", () => {
  test.use({ storageState: "e2e/buurtstallingen/.auth/admin.json" });

  test("accept asks for confirmation and turns the proposal into a reservation", async ({ page, browser }) => {
    const citizenContext = await browser.newContext();
    const citizenPage = await citizenContext.newPage();
    try {
      await proposeToCitizen(page, citizenPage);
      await citizenPage.goto(`/${URL_A}/mijn-stalling`);
      await expect(citizenPage.getByText("Aangeboden")).toBeVisible();
      await confirm(citizenPage, "Accepteren", "Dit aanbod accepteren?");
      await expect(citizenPage.getByText("Gereserveerd")).toBeVisible();
    } finally {
      await citizenContext.close();
    }
  });

  test("decline asks for confirmation and drops the offer", async ({ page, browser }) => {
    const citizenContext = await browser.newContext();
    const citizenPage = await citizenContext.newPage();
    try {
      await proposeToCitizen(page, citizenPage);
      await citizenPage.goto(`/${URL_A}/mijn-stalling`);
      await confirm(citizenPage, "Afwijzen", "Dit aanbod afwijzen?");
      await expect(citizenPage.getByText("Aangeboden")).toHaveCount(0);
    } finally {
      await citizenContext.close();
    }
  });

  test("beëindigen asks for confirmation and marks the place cancelled", async ({ page, browser }) => {
    const citizenContext = await browser.newContext();
    const citizenPage = await citizenContext.newPage();
    try {
      await loginCitizen(citizenPage);
      await citizenPage.goto(accountWizard(STALL_A, "gegevens", "fiets=1&rek=NONE"));
      await citizenPage.locator("main").getByRole("button", { name: "Reserveer een plek" }).click();
      await expect(citizenPage.getByText(/Uw plek is gereserveerd/)).toBeVisible();
      await openFacility(page, "buurtstalling");
      await workspace(page).getByRole("button", { name: "Sleutel opgehaald" }).click();
      await expect(workspace(page).getByRole("row", { name: /E2E Citizen/ }).getByText("Bezet")).toBeVisible();
      await citizenPage.goto(`/${URL_A}/mijn-stalling`);
      await expect(citizenPage.getByText("In gebruik")).toBeVisible();
      await confirm(citizenPage, "Beëindigen", "Abonnement opzeggen? U levert de sleutel binnen een week in.");
      await expect(citizenPage.getByText("Opgezegd")).toBeVisible();
    } finally {
      await citizenContext.close();
    }
  });

  test("a signed accept link performs that one action and a raw account id is rejected", async ({ page, browser }) => {
    const citizenContext = await browser.newContext();
    const citizenPage = await citizenContext.newPage();
    try {
      await proposeToCitizen(page, citizenPage);
      const mail = await waitForCapturedMail((item) => Boolean(item.subject?.includes("Er is plek voor u")));
      const token = mail.html?.match(/\/api\/buurtstallingen\/actie\?token=([^"]+)/)?.[1];
      expect(token).toBeTruthy();
      await citizenPage.goto(`/api/buurtstallingen/actie?token=${token}`);
      await expect(citizenPage.getByText("De plek is voor u gereserveerd.")).toBeVisible();
      const again = await citizenPage.goto(`/api/buurtstallingen/actie?token=${token}`);
      expect(again?.status()).toBe(400);
      const raw = await citizenPage.request.get(`/api/buurtstallingen/actie?accountID=${citizen.id}`);
      expect(raw.status()).toBe(400);
    } finally {
      await citizenContext.close();
    }
  });
});
