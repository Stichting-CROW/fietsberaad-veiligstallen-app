import { statSync } from "node:fs";
import { pathToFileURL } from "node:url";
import path from "node:path";

type SeedResult = { username: string; password: string };

async function loadSeedModule() {
  const file = path.join(process.cwd(), "docker/acceptance/seed-admin.mjs");
  const href = `${pathToFileURL(file).href}?v=${statSync(file).mtimeMs}`;
  return import(/* webpackIgnore: true */ href) as Promise<{
    ensureTestAdmin: () => Promise<SeedResult>;
    releaseTestAdminContact: () => Promise<void>;
  }>;
}

export async function ensureTestAdmin(): Promise<SeedResult> {
  const mod = await loadSeedModule();
  return mod.ensureTestAdmin();
}

export async function releaseTestAdminContact(): Promise<void> {
  const mod = await loadSeedModule();
  return mod.releaseTestAdminContact();
}
