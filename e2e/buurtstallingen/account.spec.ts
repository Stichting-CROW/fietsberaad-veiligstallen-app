import { randomBytes } from "crypto";
import type { Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma-client";
import { ACCOUNT_OCCUPANT, citizen, PASSWORD, PORTAL_EMAIL, SITE_A } from "./fixture";
import { expect, test } from "./test";
import { capturedMails, clearMail } from "./ui";

async function login(page: Page, email: string, password: string) {
  await page.goto("/account/login");
  await page.getByLabel("E-mail", { exact: true }).fill(email);
  await page.getByLabel("Wachtwoord", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Inloggen" }).click();
  await expect(page.getByRole("heading", { name: "Mijn gegevens" })).toBeVisible();
}

test("register, login, wrong password and a reset link", async ({ page }) => {
  clearMail();
  await page.goto("/account/registreren");
  await page.getByLabel("E-mail", { exact: true }).fill(PORTAL_EMAIL);
  await page.getByLabel("E-mail nogmaals").fill(PORTAL_EMAIL);
  await page.getByLabel("Wachtwoord", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Wachtwoord nogmaals").fill(PASSWORD);
  await page.getByLabel("Ik ga akkoord met de Algemene Voorwaarden").check();
  await page.getByRole("button", { name: "Account aanmaken" }).click();
  await expect(page.getByText("Mijn inloggegevens wijzigen")).toBeVisible();

  await page.context().clearCookies();
  await page.goto("/account/login");
  await page.getByLabel("E-mail", { exact: true }).fill(PORTAL_EMAIL);
  await page.getByLabel("Wachtwoord", { exact: true }).fill("fout-wachtwoord");
  await page.getByRole("button", { name: "Inloggen" }).click();
  await expect(page.getByText("Uw wachtwoord is niet geldig")).toBeVisible();

  await page.goto("/account/wachtwoord");
  await page.getByLabel("E-mail", { exact: true }).fill(PORTAL_EMAIL);
  await page.getByRole("button", { name: "Link versturen" }).click();
  await expect(page.getByText("Als het adres bekend is, is er een link verstuurd")).toBeVisible();
  const mail = capturedMails().find((item) => item.subject === "Logingegevens voor VeiligStallen" && item.to === PORTAL_EMAIL);
  const href = mail?.html?.match(/href="([^"]+)"/)?.[1] ?? "";
  const token = new URL(href).searchParams.get("token");
  expect(token, href).toBeTruthy();
  await page.goto(`/account/wachtwoord?token=${encodeURIComponent(token ?? "")}`);
  await page.getByLabel("Nieuw wachtwoord").fill("NieuwE2eWachtwoord!");
  await page.getByRole("button", { name: "Wachtwoord opslaan" }).click();
  await expect(page.getByText("Uw wachtwoord is gewijzigd")).toBeVisible();
  await login(page, PORTAL_EMAIL, "NieuwE2eWachtwoord!");
});

test("my page uses the ColdFusion section labels", async ({ page }) => {
  await login(page, citizen.email, PASSWORD);
  await page.goto("/account?showForm=abonnementen");
  for (const label of [
    "Mijn inloggegevens wijzigen",
    "Mijn instellingen wijzigen",
    "Mijn passen en codes",
    "Mijn abonnementen",
    "Mijn persoonlijke gegevens wijzigen",
    "Mijn account verwijderen",
  ]) {
    await expect(page.getByText(label)).toBeVisible();
  }
  await expect(page.getByText("Mijn kluisreserveringen")).toHaveCount(0);
});

test("delete is refused while the balance is not zero", async ({ page }) => {
  await login(page, citizen.email, PASSWORD);
  const transactionID = await payProduct(page, "paid");
  expect(transactionID).toBeTruthy();
  await page.reload();
  await expect(page.getByText("Stallingstegoed: € 10.00.")).toBeVisible();
  await page.getByText("Mijn account verwijderen").click();
  const dialogPromise = page.waitForEvent("dialog");
  const clickPromise = page.getByRole("button", { name: "Account verwijderen" }).click();
  const dialog = await dialogPromise;
  await dialog.accept();
  await clickPromise;
  await expect(page.getByText("Het stallingstegoed van deze account is niet 0.")).toBeVisible();
});

test("a 12-digit sleutelhanger can be linked and another citizen's pass is refused", async ({ page }) => {
  const owned = `9${String(Date.now()).slice(-11)}`;
  const prisma = new PrismaClient();
  try {
    await prisma.accounts_pasids.create({
      data: {
        ID: `e2epass${owned}`.padEnd(35, "0").slice(0, 35),
        AccountID: ACCOUNT_OCCUPANT,
        SiteID: SITE_A,
        PasID: owned,
        Pastype: "sleutelhanger",
      },
    });
    await login(page, citizen.email, PASSWORD);
    await page.getByLabel("Pasnummer").fill("123456789012");
    await page.getByRole("button", { name: "ID toevoegen" }).click();
    await expect(page.getByText("sleutelhanger: 123456789012")).toBeVisible();
    await page.getByLabel("Pasnummer").fill(owned);
    await page.getByRole("button", { name: "ID toevoegen" }).click();
    await expect(page.getByText("Deze pas is al gekoppeld aan een ander account.")).toBeVisible();
  } finally {
    await prisma.accounts_pasids.deleteMany({ where: { PasID: owned, AccountID: ACCOUNT_OCCUPANT } });
    await prisma.$disconnect();
  }
});

test("a paid top-up credits the balance once and a canceled payment does not", async ({ page }) => {
  await login(page, citizen.email, PASSWORD);
  const transactionID = await payProduct(page, "paid");
  await page.request.post("/api/mollie/webhook", {
    data: { id: "tr_e2e_again", status: "paid", metadata: { transactionID } },
  });
  await page.reload();
  await expect(page.getByText("Stallingstegoed: € 10.00.")).toBeVisible();
  await expect(page.getByText("Stallingstegoed: € 20.00.")).toHaveCount(0);
  await expect(page.getByText("Mijn betalingstransacties")).toBeVisible();
});

test("concurrent top-up webhooks credit the balance once", async ({ page }) => {
  await login(page, citizen.email, PASSWORD);
  const listed = await page.request.get("/api/account/topup");
  const body = await listed.json();
  const product = (body.products as { id: number; titel: string | null }[]).find((row) => row.titel === "E2E tegoed");
  expect(product).toBeTruthy();
  const created = await page.request.post("/api/account/topup", { data: { productId: product?.id } });
  expect(created.ok()).toBeTruthy();
  const topup = await created.json();
  const transactionID = String(topup.transactionID);
  const webhookBody = { id: "tr_e2e_parallel_topup", status: "paid", metadata: { transactionID } };
  await Promise.all([
    page.request.post("/api/mollie/webhook", { data: webhookBody }),
    page.request.post("/api/mollie/webhook", { data: webhookBody }),
    page.request.get(`/api/account/topup?transactionID=${encodeURIComponent(transactionID)}`),
  ]);
  const prisma = new PrismaClient();
  try {
    const okRows = await prisma.financialtransactions.findMany({
      where: { ID: transactionID, accountID: citizen.id, status: "ok" },
      select: { amount: true },
    });
    expect(okRows).toHaveLength(1);
    expect(Number(okRows[0]?.amount ?? 0)).toBe(10);
  } finally {
    await prisma.$disconnect();
  }
  await page.reload();
  await expect(page.getByText("Stallingstegoed: € 10.00.")).toBeVisible();
  await expect(page.getByText("Stallingstegoed: € 20.00.")).toHaveCount(0);
});

test("second subscription pay while open is rejected", async ({ page }) => {
  await login(page, citizen.email, PASSWORD);
  const started = await seedOpenSubscriptionPayment();
  const prisma = new PrismaClient();
  try {
    const duplicate = await page.request.post("/api/account/abonnement", {
      data: { subscriptionId: started.subscriptionRef },
    });
    expect(duplicate.status()).toBe(400);
    expect((await duplicate.json()).error).toMatch(/loopt al een betaling/i);
    const openRows = await prisma.financialtransactions.count({
      where: {
        subscriptionID: started.subscriptionId,
        code: "betaling abonnement website",
        status: { in: ["open", "pending"] },
      },
    });
    expect(openRows).toBe(1);
  } finally {
    await cleanupSubscription(prisma, started.subscriptionId);
    await prisma.$disconnect();
  }
});

test("concurrent subscription webhooks activate and debit once", async ({ page }) => {
  await login(page, citizen.email, PASSWORD);
  const started = await seedOpenSubscriptionPayment();
  const prisma = new PrismaClient();
  try {
    const webhookBody = {
      id: "tr_e2e_parallel_sub",
      status: "paid",
      metadata: { transactionID: started.transactionID },
    };
    await Promise.all([
      page.request.post("/api/mollie/webhook", { data: webhookBody }),
      page.request.post("/api/mollie/webhook", { data: webhookBody }),
      page.request.get(
        `/api/account/abonnement?id=${encodeURIComponent(started.subscriptionRef)}&transactionID=${encodeURIComponent(started.transactionID)}`,
      ),
    ]);
    const sub = await prisma.abonnementen.findUnique({ where: { ID: started.subscriptionId }, select: { isBetaald: true } });
    expect(sub?.isBetaald).toBe(true);
    expect(await ledgerCount(prisma, started.subscriptionId, "betaling abonnement website")).toBe(1);
    expect(await ledgerCount(prisma, started.subscriptionId, "abonnement")).toBe(1);
    const saldo = await prisma.accounts.findUnique({ where: { ID: citizen.id }, select: { saldo: true } });
    expect(Number(saldo?.saldo ?? 0)).toBe(0);
  } finally {
    await cleanupSubscription(prisma, started.subscriptionId);
    await prisma.$disconnect();
  }
});

test("a canceled top-up leaves the balance unchanged", async ({ page }) => {
  await login(page, citizen.email, PASSWORD);
  await payProduct(page, "canceled");
  await page.reload();
  await expect(page.getByText("Stallingstegoed: € 0.00.")).toBeVisible();
});

test("a paid subscription webhook activates the confirmation", async ({ page }) => {
  await login(page, citizen.email, PASSWORD);
  await page.goto(`/account/abonnement?siteId=${SITE_A}`);
  const section = page.locator("details", { hasText: "E2E bewaakt" });
  if (!(await section.evaluate((node) => (node as HTMLDetailsElement).open))) {
    await section.locator("summary").click();
  }
  await section.getByRole("radio", { name: /^E2E bewaakt €/ }).check();
  await section.getByRole("button", { name: "Verder" }).click();
  await expect(page.getByRole("heading", { name: "Pas koppelen" })).toBeVisible();
  await page.getByRole("radio", { name: "Ik heb nog geen sleutelhanger" }).check();
  const responsePromise = page.waitForResponse((response) => response.url().includes("/api/account/abonnement") && response.request().method() === "POST");
  await page.getByRole("button", { name: /iDeal/ }).click();
  const created = await (await responsePromise).json();
  await expect(page.getByText("Uw betaling wordt verwerkt. Een ogenblik geduld...")).toBeVisible();
  await expect(page.getByText("U heeft gekozen voor het volgende product:")).toBeVisible();
  await page.request.post("/api/mollie/webhook", {
    data: { id: "tr_e2e_sub", status: "paid", metadata: { transactionID: created.transactionID } },
  });
  await page.reload();
  await expect(page.getByText("Uw betaling is geslaagd.")).toBeVisible();
  await expect(page.getByText("U heeft het volgende product aangeschaft:")).toBeVisible();
  await expect(page.getByText(/1x E2E bewaakt/)).toBeVisible();
  await expect(page.getByText(/Dit abonnement is geldig van/)).toBeVisible();
  await expect(page.getByText(/Noteer uw id-code: [A-Z0-9]\d{11}/)).toBeVisible();
});

test("verlengen only offers the current type, starting after the running subscription", async ({ page }) => {
  const prisma = new PrismaClient();
  try {
    const form = await prisma.abonnementsvormen.findFirst({
      where: { naam: "E2E bewaakt", siteID: SITE_A },
      include: { abonnementsvorm_fietsenstalling: true },
    });
    expect(form).toBeTruthy();
    const other = await prisma.abonnementsvormen.create({
      data: { naam: "E2E bewaakt ander", prijs: "20.00", tijdsduur: 12, siteID: SITE_A, bikeparkTypeID: "bewaakt", isActief: true, idmiddelen: "sleutelhanger" },
    });
    await prisma.abonnementsvorm_fietsenstalling.createMany({
      data: (form?.abonnementsvorm_fietsenstalling ?? []).map((link) => ({ SubscriptiontypeID: other.ID, BikeparkID: link.BikeparkID })),
    });
    const end = new Date(Date.now() + 20 * 86400000);
    end.setHours(23, 59, 59, 0);
    const running = await prisma.abonnementen.create({
      data: {
        externalID: "e2e-prolong-subscription",
        AccountID: citizen.id,
        subscriptiontypeID: form?.ID,
        siteID: SITE_A,
        ingangsdatum: new Date(Date.now() - 10 * 86400000),
        afloopdatum: end,
        prijsInclBtw: "15.00",
        isActief: true,
        isBetaald: true,
        emailNadertEinde: false,
        type: "abonnement",
      },
    });
    await login(page, citizen.email, PASSWORD);
    await page.goto(`/account/abonnement?siteId=${SITE_A}&prolongId=${running.externalID}`);
    const start = new Date(end.getTime() + 1000);
    const startText = `${String(start.getDate()).padStart(2, "0")}-${String(start.getMonth() + 1).padStart(2, "0")}-${start.getFullYear()}`;
    await expect(page.getByRole("radio", { name: /^E2E bewaakt €/ })).toBeChecked();
    await expect(page.getByText(`: ${startText}`).first()).toBeVisible();
    await expect(page.getByText("E2E bewaakt ander")).toHaveCount(0);
    await expect(page.getByRole("button", { name: /iDeal/ })).toBeVisible();
    const refused = await page.request.post("/api/account/abonnement", { data: { formId: other.ID, prolongId: running.externalID } });
    expect(refused.status()).toBe(400);
    expect((await refused.json()).error).toBe("Dit abonnement kan niet worden verlengd");
    const byNumber = await page.request.get(`/api/account/abonnement?id=${running.ID}`);
    expect(byNumber.status()).toBe(400);
  } finally {
    await prisma.abonnementen.deleteMany({ where: { externalID: "e2e-prolong-subscription" } });
    const other = await prisma.abonnementsvormen.findFirst({ where: { naam: "E2E bewaakt ander", siteID: SITE_A } });
    if (other) {
      await prisma.abonnementsvorm_fietsenstalling.deleteMany({ where: { SubscriptiontypeID: other.ID } });
      await prisma.abonnementsvormen.delete({ where: { ID: other.ID } });
    }
    await prisma.$disconnect();
  }
});

test("the daily job deactivates an expired subscription and warns only once", async ({ page }) => {
  clearMail();
  const prisma = new PrismaClient();
  try {
    const form = await prisma.abonnementsvormen.findFirst({ where: { naam: "E2E bewaakt", siteID: SITE_A } });
    expect(form).toBeTruthy();
    const expiredForm = await prisma.abonnementsvormen.create({
      data: { naam: "E2E bewaakt verlopen", prijs: "15.00", tijdsduur: 12, siteID: SITE_A, bikeparkTypeID: "bewaakt", isActief: true },
    });
    const now = Date.now();
    await prisma.abonnementen.create({
      data: {
        externalID: "e2e-expired-subscription",
        AccountID: citizen.id,
        subscriptiontypeID: expiredForm.ID,
        siteID: SITE_A,
        ingangsdatum: new Date(now - 60 * 86400000),
        afloopdatum: new Date(now - 86400000),
        prijsInclBtw: "15.00",
        isActief: true,
        isBetaald: true,
        emailNadertEinde: false,
        type: "abonnement",
      },
    });
    await prisma.abonnementen.create({
      data: {
        externalID: "e2e-warning-subscription",
        AccountID: citizen.id,
        subscriptiontypeID: form?.ID,
        siteID: SITE_A,
        ingangsdatum: new Date(now - 40 * 86400000),
        afloopdatum: new Date(now + 10 * 86400000),
        prijsInclBtw: "15.00",
        isActief: true,
        isBetaald: true,
        emailNadertEinde: false,
        type: "abonnement",
      },
    });
    const headers: Record<string, string> = {};
    if (process.env.CRON_SECRET) headers.Authorization = `Bearer ${process.env.CRON_SECRET}`;
    const first = await page.request.post("/api/cron/abonnementen", { headers, data: { accountId: citizen.id } });
    expect(first.ok()).toBeTruthy();
    const expired = await prisma.abonnementen.findFirst({ where: { externalID: "e2e-expired-subscription" } });
    expect(expired?.isActief).toBe(false);
    expect(capturedMails().filter((item) => item.subject === "Uw abonnement verloopt binnenkort")).toHaveLength(1);
    const second = await page.request.post("/api/cron/abonnementen", { headers, data: { accountId: citizen.id } });
    expect(second.ok()).toBeTruthy();
    expect(capturedMails().filter((item) => item.subject === "Uw abonnement verloopt binnenkort")).toHaveLength(1);
    expect(capturedMails().filter((item) => item.subject === "Stallingsabonnement is verlopen")).toHaveLength(1);
  } finally {
    await prisma.$disconnect();
  }
});

/** Unpaid subscription with one open iDEAL row, as after buy + pay before Mollie completes. */
async function seedOpenSubscriptionPayment() {
  const prisma = new PrismaClient();
  try {
    const form = await prisma.abonnementsvormen.findFirst({
      where: { naam: "E2E bewaakt", siteID: SITE_A },
      select: { ID: true, prijs: true, exploitantSiteID: true },
    });
    if (!form) throw new Error("E2E bewaakt form missing");
    const externalID = `e2eopen${randomBytes(8).toString("hex")}`;
    const transactionID = randomBytes(16).toString("hex");
    const end = new Date(Date.now() + 30 * 86400000);
    const subscription = await prisma.abonnementen.create({
      data: {
        externalID,
        AccountID: citizen.id,
        subscriptiontypeID: form.ID,
        siteID: SITE_A,
        exploitantID: form.exploitantSiteID,
        ingangsdatum: new Date(),
        afloopdatum: end,
        prijsInclBtw: form.prijs,
        isActief: false,
        isBetaald: false,
        emailNadertEinde: false,
        type: "abonnement",
        dateCreated: new Date(),
      },
    });
    await prisma.financialtransactions.create({
      data: {
        ID: transactionID,
        amount: form.prijs,
        transactionDate: new Date(),
        paymentMethod: "ideal",
        status: "open",
        description: "Betaling abonnement",
        code: "betaling abonnement website",
        accountID: citizen.id,
        paidToSiteID: "1",
        siteID: SITE_A,
        subscriptionID: subscription.ID,
        subscriptiontypeID: form.ID,
        mollieTransactionID: `test_${transactionID.slice(0, 12)}`,
      },
    });
    return { subscriptionRef: externalID, transactionID, subscriptionId: subscription.ID };
  } finally {
    await prisma.$disconnect();
  }
}

async function ledgerCount(prisma: PrismaClient, subscriptionId: number, code: string) {
  return prisma.financialtransactions.count({
    where: { subscriptionID: subscriptionId, code, status: "ok" },
  });
}

async function cleanupSubscription(prisma: PrismaClient, subscriptionId: number) {
  await prisma.financialtransactions.deleteMany({ where: { subscriptionID: subscriptionId } });
  await prisma.abonnementen.deleteMany({ where: { ID: subscriptionId } });
}

async function payProduct(page: Page, status: "paid" | "canceled"): Promise<string> {
  const listed = await page.request.get("/api/account/topup");
  const body = await listed.json();
  const product = (body.products as { id: number; titel: string | null }[]).find((row) => row.titel === "E2E tegoed");
  expect(product).toBeTruthy();
  const created = await page.request.post("/api/account/topup", { data: { productId: product?.id } });
  expect(created.ok()).toBeTruthy();
  const topup = await created.json();
  const webhook = await page.request.post("/api/mollie/webhook", {
    data: { id: `tr_e2e_${status}`, status, metadata: { transactionID: topup.transactionID } },
  });
  expect(webhook.ok()).toBeTruthy();
  return String(topup.transactionID);
}
