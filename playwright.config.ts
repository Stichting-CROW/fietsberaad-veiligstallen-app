import { resolve } from "node:path";
import { defineConfig, devices } from "@playwright/test";

const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
const mailCapturePath = resolve(process.cwd(), "e2e/buurtstallingen/.mail-capture.jsonl");
const webServerEnv = {
  ...process.env,
  BUURTSTALLINGEN_MAIL_CAPTURE: process.env.BUURTSTALLINGEN_MAIL_CAPTURE ?? mailCapturePath,
  BUURTSTALLINGEN_ENGINE_SITE_IDS: process.env.BUURTSTALLINGEN_ENGINE_SITE_IDS ?? "*",
  MOLLIE_API_KEY: "disabled",
};

export default defineConfig({
  testDir: "e2e/buurtstallingen",
  globalSetup: "./e2e/buurtstallingen/global-setup.ts",
  globalTeardown: "./e2e/buurtstallingen/global-teardown.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 20_000 },
  retries: 0,
  reporter: "list",
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  ...(process.env.PLAYWRIGHT_NO_WEBSERVER
    ? {}
    : {
        webServer: {
          command: "npx next dev --port 3000",
          url: "http://localhost:3000",
          reuseExistingServer: !process.env.CI,
          timeout: 180_000,
          env: webServerEnv,
        },
      }),
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "displays",
      testDir: "e2e/displays",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "harness",
      testMatch: /harness\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "beheer",
      testMatch: /beheer\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "citizen",
      testMatch: /citizen\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "account",
      testMatch: /account\.spec\.ts/,
      dependencies: ["setup"],
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
