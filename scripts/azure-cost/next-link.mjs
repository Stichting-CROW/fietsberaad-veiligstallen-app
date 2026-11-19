import fs from "fs";

const file = process.argv[2];
let link = "";
try {
  const body = JSON.parse(fs.readFileSync(file, "utf8"));
  link = body?.properties?.nextLink || body?.nextLink || "";
} catch {
  link = "";
}
process.stdout.write(link);
