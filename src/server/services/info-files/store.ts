import fs from "node:fs/promises";
import path from "node:path";

export type InfoFileName = "veiligstallen.kml" | "veiligstallen.xml";

/** Same rule as the report cache: env override, then /home on production, then a local cache dir. */
export function getKmlExportDir(): string {
  if (process.env.KML_EXPORT_DIR) return process.env.KML_EXPORT_DIR;
  if (process.env.NODE_ENV === "production") return "/home/kmlexport";
  return path.join(process.env.ROOT_DIR || process.cwd(), ".cache/kmlexport");
}

export async function readInfoFile(name: InfoFileName): Promise<string | null> {
  try {
    return await fs.readFile(path.join(getKmlExportDir(), name), "utf8");
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

export async function infoFilesExist(): Promise<boolean> {
  const [kml, xml] = await Promise.all([readInfoFile("veiligstallen.kml"), readInfoFile("veiligstallen.xml")]);
  return kml != null && xml != null;
}

export async function writeInfoFiles(files: { kml: string; xml: string }): Promise<void> {
  const directory = getKmlExportDir();
  await fs.mkdir(directory, { recursive: true });
  await writeAtomic(directory, "veiligstallen.kml", files.kml);
  await writeAtomic(directory, "veiligstallen.xml", files.xml);
}

async function writeAtomic(directory: string, name: InfoFileName, body: string): Promise<void> {
  const target = path.join(directory, name);
  const temporary = `${target}.tmp`;
  await fs.writeFile(temporary, body, "utf8");
  await fs.rename(temporary, target);
}

function isNotFound(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && (error as { code: string }).code === "ENOENT";
}
