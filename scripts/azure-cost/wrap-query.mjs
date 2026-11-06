import fs from "fs";
import path from "path";

const [month, outcome, workDir, outFile, environment = "", subscriptionName = ""] = process.argv.slice(2);

function read(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function statusFromError(text) {
  if (/AuthorizationFailed|does not have authorization|Authorization_RequestDenied|403/i.test(text)) {
    return "denied";
  }
  if (/InvalidTimeframe|time period|beyond the allowed|retention|BillingPeriod/i.test(text)) {
    return "unavailable";
  }
  return "error";
}

const pages = fs
  .readdirSync(workDir)
  .filter((name) => /^page-\d+\.json$/.test(name))
  .sort((a, b) => Number(a.match(/\d+/)[0]) - Number(b.match(/\d+/)[0]))
  .map((name) => {
    try {
      return JSON.parse(read(path.join(workDir, name)));
    } catch {
      return null;
    }
  })
  .filter(Boolean);

const errors = fs
  .readdirSync(workDir)
  .filter((name) => /^err-\d+\.txt$/.test(name))
  .map((name) => read(path.join(workDir, name)).trim())
  .filter(Boolean);

let status = "ok";
let error = null;
if (outcome !== "ok" || pages.length === 0) {
  error = errors.join("\n") || "Cost query returned no body";
  status = statusFromError(error);
}

const doc = {
  month,
  status,
  error,
  environment: environment || null,
  subscriptionName: subscriptionName || null,
  fetchedAt: new Date().toISOString(),
  pages,
};

fs.mkdirSync(path.dirname(outFile), { recursive: true });
fs.writeFileSync(outFile, JSON.stringify(doc, null, 2));
