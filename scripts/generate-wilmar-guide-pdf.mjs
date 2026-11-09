/**
 * Build docs/userdocs/wilmar-v4-api-handleiding.pdf from the Markdown guide.
 * Pandoc makes HTML; Chrome prints it with wilmar-v4-api-handleiding.css.
 *
 *   npm run docs:wilmar
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const mdPath = path.join(root, "docs/userdocs/wilmar-v4-api-handleiding.md");
const cssPath = path.join(root, "docs/userdocs/wilmar-v4-api-handleiding.css");
const pdfPath = path.join(root, "docs/userdocs/wilmar-v4-api-handleiding.pdf");
const htmlPath = path.join(os.tmpdir(), "wilmar-v4-api-handleiding.html");

function run(cmd, args) {
  const result = spawnSync(cmd, args, { encoding: "utf8" });
  if (result.status !== 0) {
    const detail = [result.stdout, result.stderr].filter(Boolean).join("\n");
    throw new Error(`${cmd} failed (${result.status ?? "signal"})\n${detail}`);
  }
}

run("pandoc", [
  mdPath,
  "-f",
  "gfm",
  "-t",
  "html5",
  "--standalone",
  "--css",
  cssPath,
  "-M",
  "lang=nl",
  "-o",
  htmlPath,
]);

const tmpPdf = path.join(os.tmpdir(), "wilmar-v4-api-handleiding.pdf");
run("google-chrome", [
  "--headless=new",
  "--disable-gpu",
  "--no-sandbox",
  "--disable-dev-shm-usage",
  "--no-pdf-header-footer",
  `--print-to-pdf=${tmpPdf}`,
  `file://${htmlPath}`,
]);

fs.copyFileSync(tmpPdf, pdfPath);
console.log(pdfPath);
