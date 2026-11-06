import { test, expect } from "@playwright/test";
import type { Page } from "@playwright/test";
import { PASSWORD, users } from "./fixture";

async function signIn(page: Page, email: string) {
  const csrf = await page.request.get("/api/auth/csrf");
  const { csrfToken } = (await csrf.json()) as { csrfToken: string };
  const response = await page.request.post("/api/auth/callback/credentials", {
    form: {
      csrfToken,
      email,
      password: PASSWORD,
      callbackUrl: "http://localhost:3000/beheer/buurtstallingen",
      json: "true",
    },
  });
  expect(response.ok()).toBe(true);
  const body = (await response.json()) as { url?: string };
  expect(body.url ?? "").not.toContain("error");
  await page.goto("/beheer/buurtstallingen");
}

for (const key of ["viewer", "admin", "rootadmin"] as const) {
  test(`login ${key}`, async ({ page }) => {
    await signIn(page, users[key].email);
    await expect(page.getByRole("heading", { name: "Buurtstallingen / fietstrommels" })).toBeVisible();
    await page.context().storageState({ path: `e2e/buurtstallingen/.auth/${key}.json` });
  });
}

for (const key of ["none", "nomodule"] as const) {
  test(`login ${key}`, async ({ page }) => {
    await signIn(page, users[key].email);
    await expect(page).toHaveURL(/\/beheer\/buurtstallingen$/);
    await page.context().storageState({ path: `e2e/buurtstallingen/.auth/${key}.json` });
  });
}
