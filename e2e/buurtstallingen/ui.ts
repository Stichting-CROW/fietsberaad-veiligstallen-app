import { readFileSync, rmSync } from "node:fs";
import { resolve } from "node:path";
import type { Download, Page } from "@playwright/test";
import { PrismaClient } from "../../src/generated/prisma-client";
import { MAIL_CAPTURE, STALL_A, STALL_TROMMEL } from "./fixture";
import { loadLocalEnv } from "./env";

export function workspace(page: Page) {
  return page.locator("div.space-y-4.p-6");
}

export async function openFacility(page: Page, kind: "buurtstalling" | "fietstrommel") {
  const initial = page.waitForResponse((response) => response.url().includes("type=buurtstalling") && response.ok());
  await page.goto("/beheer/buurtstallingen");
  const box = workspace(page);
  await box.getByRole("heading", { name: "Buurtstallingen / fietstrommels" }).waitFor();
  await initial;
  const id = kind === "fietstrommel" ? STALL_TROMMEL : STALL_A;
  if (kind === "fietstrommel") {
    const loaded = page.waitForResponse((response) => response.url().includes("type=fietstrommel") && response.ok());
    await box.getByRole("button", { name: "Fietstrommels", exact: true }).click();
    await loaded;
  }
  const select = box.getByLabel("Stalling");
  await select.locator(`option[value="${id}"]`).waitFor({ state: "attached" });
  await select.selectOption(id);
  const heading = kind === "fietstrommel" ? "Trommel (NONE)" : "Onder (UNDER)";
  await box.getByRole("heading", { name: heading }).waitFor();
}

export async function reserveForCustomer(page: Page, email: string) {
  const box = workspace(page);
  await box.getByPlaceholder("Zoek naam of e-mail").fill(email);
  await box.getByRole("button", { name: "Zoek", exact: true }).click();
  const customer = box.locator("select").filter({ hasText: "Kies klant" });
  const option = customer.locator("option", { hasText: email });
  await option.waitFor({ state: "attached" });
  await customer.selectOption({ label: ((await option.textContent()) ?? "").trim() });
  await box.getByRole("button", { name: "Reserveer", exact: true }).click();
}

export function clearMail(): void {
  rmSync(resolve(MAIL_CAPTURE), { force: true });
}

export type CapturedMail = { to?: string; cc?: string | null; subject?: string; html?: string };

export function capturedMails(): CapturedMail[] {
  try {
    const text = readFileSync(resolve(MAIL_CAPTURE), "utf8").trim();
    if (!text) return [];
    return text.split("\n").map((line) => JSON.parse(line) as CapturedMail);
  } catch {
    return [];
  }
}

/** Polls the mail capture file until a matching line appears (async mail / separate dev process). */
export async function waitForCapturedMail(
  predicate: (mail: CapturedMail) => boolean,
  timeoutMs = 20_000,
): Promise<CapturedMail> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const mail = capturedMails().find(predicate);
    if (mail) return mail;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  const subjects = capturedMails().map((item) => item.subject ?? "(geen onderwerp)").join("; ") || "(geen mails)";
  throw new Error(`Geen mail gevonden binnen ${timeoutMs}ms. Gevangen onderwerpen: ${subjects}`);
}

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

export function parseCsv(text: string): string[][] {
  return text.replace(/^\uFEFF/, "").trim().split(/\n/).filter(Boolean).map(parseCsvLine);
}

export async function readDownload(download: Download): Promise<string> {
  const file = await download.path();
  if (!file) throw new Error("download heeft geen bestand");
  return readFileSync(file, "utf8");
}

export async function paidSubscriptions(accountId: string): Promise<number> {
  loadLocalEnv();
  const prisma = new PrismaClient();
  try {
    return await prisma.abonnementen.count({ where: { AccountID: accountId, isBetaald: true, isActief: true } });
  } finally {
    await prisma.$disconnect();
  }
}
