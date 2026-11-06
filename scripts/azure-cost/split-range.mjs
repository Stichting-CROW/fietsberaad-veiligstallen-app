import fs from "fs";
import path from "path";

const [workDir, rawDir, resourceGroup = "", environment = "", subscriptionName = ""] = process.argv.slice(2);

function read(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function columnIndex(columns, names) {
  const normalized = columns.map((column) => String(column?.name || column).toLowerCase());
  for (const name of names) {
    const index = normalized.indexOf(name.toLowerCase());
    if (index >= 0) return index;
  }
  return -1;
}

function monthFrom(value) {
  const text = String(value || "");
  const match = text.match(/(\d{4})[-/](\d{2})/);
  if (match) return `${match[1]}-${match[2]}`;
  const compact = text.match(/^(\d{4})(\d{2})\d{2}$/);
  if (compact) return `${compact[1]}-${compact[2]}`;
  return "";
}

function fileOk(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8")).status === "ok";
  } catch {
    return false;
  }
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

const byMonth = new Map();
for (const page of pages) {
  const props = page?.properties || page;
  const columns = props?.columns || [];
  const rows = props?.rows || [];
  const dateIdx = columnIndex(columns, ["UsageDate", "BillingMonth", "Date"]);
  if (dateIdx < 0) {
    console.error("Monthly query did not return a date column");
    process.exit(1);
  }
  for (const row of rows) {
    const month = monthFrom(row[dateIdx]);
    if (!month) continue;
    if (!byMonth.has(month)) byMonth.set(month, { columns, rows: [] });
    byMonth.get(month).rows.push(row);
  }
}

fs.mkdirSync(rawDir, { recursive: true });
for (const [month, bucket] of byMonth) {
  const out = resourceGroup
    ? path.join(rawDir, `usage-${month}--${resourceGroup}.json`)
    : path.join(rawDir, `usage-${month}.json`);
  if (fileOk(out)) {
    console.log(`Skip ${out}`);
    continue;
  }
  const doc = {
    month,
    status: "ok",
    error: null,
    environment: environment || null,
    subscriptionName: subscriptionName || null,
    fetchedAt: new Date().toISOString(),
    pages: [{ properties: { columns: bucket.columns, rows: bucket.rows } }],
  };
  fs.writeFileSync(out, JSON.stringify(doc, null, 2));
  console.log(`Wrote ${out}`);
}
