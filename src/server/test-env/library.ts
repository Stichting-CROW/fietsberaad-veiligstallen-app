import { createWriteStream } from "node:fs";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pipeline } from "node:stream/promises";
import type { Readable } from "node:stream";
import type { Connection, RowDataPacket } from "mysql2/promise";

const STATIC = "https://static.veiligstallen.nl/library";

export function libraryRoot(): string {
  return process.env.LIBRARY_DIR || path.join(process.cwd(), "docker/acceptance/library");
}

function safeName(value: unknown): string | null {
  const raw = value == null ? "" : String(value).trim();
  if (!raw || raw.startsWith("[local]")) return null;
  const withoutQuery = raw.split("?")[0] ?? "";
  let base = withoutQuery;
  try {
    if (withoutQuery.startsWith("http://") || withoutQuery.startsWith("https://")) {
      base = path.posix.basename(new URL(withoutQuery).pathname);
    } else {
      base = path.posix.basename(withoutQuery);
    }
  } catch {
    return null;
  }
  if (!base || base === "." || base === ".." || base.includes("/") || base.includes("\\")) return null;
  return base;
}

async function download(url: string, destination: string): Promise<boolean> {
  const response = await fetch(url);
  if (!response.ok || !response.body) return false;
  await pipeline(response.body as unknown as Readable, createWriteStream(destination));
  return true;
}

async function names(conn: Connection, sql: string): Promise<string[]> {
  const [rows] = await conn.query<RowDataPacket[]>(sql);
  const found: string[] = [];
  for (const row of rows) {
    for (const value of Object.values(row)) {
      const name = safeName(value);
      if (name) found.push(name);
    }
  }
  return [...new Set(found)];
}

export async function downloadLibrary(conn: Connection, onStep: (step: string) => void): Promise<number> {
  const root = libraryRoot();
  const jobs: Array<{ subdir: string; file: string; url: string }> = [];
  const add = (subdir: string, file: string, url: string) => jobs.push({ subdir, file, url });

  for (const file of await names(conn, "SELECT CompanyLogo AS file FROM contacts WHERE CompanyLogo IS NOT NULL AND CompanyLogo <> ''")) {
    add("logo", file, `${STATIC}/logo/${encodeURIComponent(file)}`);
  }
  for (const file of await names(conn, "SELECT CompanyLogo2 AS file FROM contacts WHERE CompanyLogo2 IS NOT NULL AND CompanyLogo2 <> ''")) {
    add("logo2", file, `${STATIC}/logo2/${encodeURIComponent(file)}`);
  }
  for (const file of await names(conn, "SELECT Image AS file FROM fietsenstallingen WHERE Image IS NOT NULL AND Image <> ''")) {
    add("fietsenstallingen", file, `${STATIC}/fietsenstallingen/${encodeURIComponent(file)}`);
  }
  for (const file of await names(conn, "SELECT Image AS file, Thumbnail AS file2 FROM prijzen WHERE Image IS NOT NULL OR Thumbnail IS NOT NULL")) {
    add("prijzen", file, `${STATIC}/prijzen/${encodeURIComponent(file)}`);
  }
  add("client", "logo.png", "https://fms.veiligstallen.nl/resources/client/logo.png");

  onStep(`bibliotheek (${jobs.length} bestanden)`);
  let saved = 0;
  for (let index = 0; index < jobs.length; index += 4) {
    const batch = jobs.slice(index, index + 4);
    await Promise.all(batch.map(async (job) => {
      const dir = path.join(root, job.subdir);
      await mkdir(dir, { recursive: true });
      try {
        const ok = await download(job.url, path.join(dir, job.file));
        if (ok) saved += 1;
      } catch {
        // A missing photo does not fail the snapshot.
      }
    }));
  }
  return saved;
}
