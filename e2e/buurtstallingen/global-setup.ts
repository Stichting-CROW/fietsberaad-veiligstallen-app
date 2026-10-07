import { mkdirSync } from "node:fs";
import { seed } from "./seed";

export default async function globalSetup(): Promise<void> {
  mkdirSync("e2e/buurtstallingen/.auth", { recursive: true });
  await seed();
}
