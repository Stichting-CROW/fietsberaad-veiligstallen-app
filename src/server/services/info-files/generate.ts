import { loadInfoStallingen } from "./load";
import { infoFilesRefreshPaused, renderInfoFiles } from "./render";
import { infoFilesExist, readInfoFile, writeInfoFiles, type InfoFileName } from "./store";

export type GenerateInfoFilesResult = {
  skipped: boolean;
  stallingen: number;
};

export async function generateInfoFiles(now = new Date(), options?: { force?: boolean }): Promise<GenerateInfoFilesResult> {
  if (infoFilesRefreshPaused(now) && !options?.force && (await infoFilesExist())) {
    return { skipped: true, stallingen: 0 };
  }
  const stallingen = await loadInfoStallingen();
  await writeInfoFiles(renderInfoFiles(stallingen, now));
  return { skipped: false, stallingen: stallingen.length };
}

export async function readOrGenerateInfoFile(name: InfoFileName, now = new Date()): Promise<string> {
  const existing = await readInfoFile(name);
  if (existing != null) return existing;
  await generateInfoFiles(now, { force: true });
  const created = await readInfoFile(name);
  return created ?? "";
}
