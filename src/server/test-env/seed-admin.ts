import { pathToFileURL } from "node:url";
import path from "node:path";

type SeedResult = { username: string; password: string };

export async function ensureTestAdmin(): Promise<SeedResult> {
  const href = pathToFileURL(path.join(process.cwd(), "docker/acceptance/seed-admin.mjs")).href;
  const mod = await import(/* webpackIgnore: true */ href) as { ensureTestAdmin: () => Promise<SeedResult> };
  return mod.ensureTestAdmin();
}
