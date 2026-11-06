import { readFileSync, rmSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { expect, test } from "./test";
import { MAIL_CAPTURE, PASSWORD, STALL_A, URL_A, URL_B, citizen } from "./fixture";

test("public listing shows the seeded stalling and hides the other gemeente", async ({ page }) => {
  await page.goto(`/${URL_A}/buurtstallingen`);
  await expect(page.getByRole("heading", { name: "Buurtstallingen in E2E Buurt A" })).toBeVisible();
  await expect(page.getByRole("link", { name: "E2E Buurtstalling" })).toBeVisible();
  await expect(page.getByText("1 vrije plekken")).toBeVisible();
  await expect(page.getByText("E2E Stalling B")).toHaveCount(0);

  await page.goto(`/${URL_A}/fietstrommels`);
  await expect(page.getByRole("link", { name: "E2E Fietstrommel" })).toBeVisible();
  await expect(page.getByText("0 vrije plekken")).toBeVisible();

  const other = await page.goto(`/${URL_B}/buurtstallingen/${STALL_A}`);
  expect(other?.status()).toBe(404);
});

test.describe("viewer", () => {
  test.use({ storageState: "e2e/buurtstallingen/.auth/viewer.json" });

  test("opens the workspace without the personal exports", async ({ page }) => {
    await page.goto("/beheer/buurtstallingen");
    await expect(page.getByRole("heading", { name: "Buurtstallingen / fietstrommels" })).toBeVisible();
    await expect(page.getByRole("option", { name: "E2E Buurtstalling" })).toBeAttached();
    const workspace = page.locator("div.space-y-4.p-6");
    await workspace.getByRole("button", { name: "Export", exact: true }).click();
    await expect(page.getByRole("link", { name: "Maandrapport (CSV)" })).toBeVisible();
    await expect(workspace.getByText("Wachtlijst", { exact: true })).toHaveCount(0);
  });
});

test.describe("admin", () => {
  test.use({ storageState: "e2e/buurtstallingen/.auth/admin.json" });

  test("sees the personal exports", async ({ page }) => {
    await page.goto("/beheer/buurtstallingen");
    const workspace = page.locator("div.space-y-4.p-6");
    await workspace.getByRole("button", { name: "Export", exact: true }).click();
    await expect(workspace.getByText("Wachtlijst", { exact: true })).toBeVisible();
    await expect(workspace.getByText("Gebruikers", { exact: true })).toBeVisible();
  });
});

test.describe("rootadmin", () => {
  test.use({ storageState: "e2e/buurtstallingen/.auth/rootadmin.json" });

  test("opens the workspace", async ({ page }) => {
    await page.goto("/beheer/buurtstallingen");
    await expect(page.getByRole("heading", { name: "Buurtstallingen / fietstrommels" })).toBeVisible();
    await expect(page.getByRole("option", { name: "E2E Buurtstalling" })).toBeAttached();
  });
});

test("citizen session stays inside the own gemeente", async ({ page }) => {
  const login = await page.request.post("/api/buurtstallingen/session", {
    data: { urlName: URL_A, email: citizen.email, password: PASSWORD },
  });
  expect(login.ok()).toBeTruthy();
  await page.goto(`/${URL_A}/mijn-stalling`);
  await expect(page.getByRole("heading", { name: "Mijn stalling" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Wachtlijst" })).toBeVisible();
  await expect(page.getByText("Log in via een buurtstalling om uw plekken te zien.")).toHaveCount(0);
  const other = await page.goto(`/${URL_B}/buurtstallingen/${STALL_A}`);
  expect(other?.status()).toBe(404);
});

test("mail capture records a send when SMTP is absent", async () => {
  rmSync(MAIL_CAPTURE, { force: true });
  const env = { ...process.env, BUURTSTALLINGEN_MAIL_CAPTURE: MAIL_CAPTURE };
  for (const key of ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM"]) delete env[key];
  const result = spawnSync("npx", ["tsx", "e2e/buurtstallingen/capture-check.ts"], { encoding: "utf8", env });
  expect(result.status, result.stderr || result.stdout).toBe(0);
  const last = readFileSync(MAIL_CAPTURE, "utf8").trim().split("\n").at(-1);
  const recorded = JSON.parse(last ?? "{}") as { to?: string; subject?: string };
  expect(recorded.to).toBe(citizen.email);
  expect(recorded.subject).toBe("e2e capture");
});
