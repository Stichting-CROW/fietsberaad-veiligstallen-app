// Manual clock tick for local development: npm run tick [baseUrl]
const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const headers = process.env.CRON_SECRET ? { Authorization: `Bearer ${process.env.CRON_SECRET}` } : {};

const res = await fetch(`${base}/api/cron/tick`, { method: "POST", headers });
const body = await res.text();
try {
  console.log(JSON.stringify(JSON.parse(body), null, 2));
} catch {
  console.log(body);
}
if (!res.ok) process.exit(1);
