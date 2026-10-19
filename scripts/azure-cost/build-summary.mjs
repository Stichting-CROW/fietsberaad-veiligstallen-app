import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const dataDir = path.join(root, "data/azure-costs");
const rawDir = path.join(dataDir, "raw");

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return fallback;
  }
}

function listFiles(dir, pred) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).filter(pred).map((name) => path.join(dir, name));
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function columnIndex(columns, names) {
  const wanted = names.map((name) => name.toLowerCase());
  return columns.findIndex((column) => wanted.includes(String(column.name || "").toLowerCase()));
}

function rowsFromQueryPage(page) {
  const props = page?.properties || page;
  const columns = props?.columns || [];
  const rows = props?.rows || [];
  if (!columns.length || !rows.length) return [];
  const costIdx = columnIndex(columns, ["Cost", "PreTaxCost"]);
  const idIdx = columnIndex(columns, ["ResourceId"]);
  const serviceIdx = columnIndex(columns, ["ServiceName", "MeterCategory"]);
  const currencyIdx = columnIndex(columns, ["Currency"]);
  return rows.map((row) => ({
    resourceId: idIdx >= 0 ? String(row[idIdx] || "") : "",
    serviceName: serviceIdx >= 0 ? String(row[serviceIdx] || "") : "",
    cost: costIdx >= 0 ? Number(row[costIdx] || 0) : 0,
    currency: currencyIdx >= 0 ? String(row[currencyIdx] || "") : "",
  }));
}

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (quoted) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          cell += '"';
          i++;
        } else quoted = false;
      } else cell += char;
    } else if (char === '"') quoted = true;
    else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n") {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else if (char !== "\r") cell += char;
  }
  if (cell.length || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows.filter((line) => line.some((value) => value !== ""));
}

function headerIndex(headers, names) {
  const normalized = headers.map((header) => header.trim().toLowerCase());
  for (const name of names) {
    const index = normalized.indexOf(name.toLowerCase());
    if (index >= 0) return index;
  }
  return -1;
}

function monthFromDate(value) {
  const match = String(value || "").match(/(\d{4})[-/](\d{2})/);
  if (match) return `${match[1]}-${match[2]}`;
  const alt = String(value || "").match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
  if (alt) return `${alt[3]}-${alt[2]}`;
  return "";
}

function rowsFromPortalCsv(file) {
  const table = parseCsv(fs.readFileSync(file, "utf8"));
  if (table.length < 2) return [];
  const headers = table[0];
  const costIdx = headerIndex(headers, ["Cost", "CostInBillingCurrency", "PreTaxCost"]);
  const idIdx = headerIndex(headers, ["ResourceId"]);
  const nameIdx = headerIndex(headers, ["ResourceName", "Resource"]);
  const groupIdx = headerIndex(headers, ["ResourceGroup", "ResourceGroupName"]);
  const serviceIdx = headerIndex(headers, ["ServiceName", "MeterCategory", "ConsumedService", "Service name"]);
  const dateIdx = headerIndex(headers, ["UsageDate", "Date", "Usage date", "BillingMonth"]);
  const currencyIdx = headerIndex(headers, ["Currency", "BillingCurrency"]);
  const out = [];
  for (const line of table.slice(1)) {
    const month = monthFromDate(dateIdx >= 0 ? line[dateIdx] : "");
    if (!month) continue;
    out.push({
      month,
      resourceId: idIdx >= 0 ? line[idIdx] || "" : "",
      resourceName: nameIdx >= 0 ? line[nameIdx] || "" : "",
      resourceGroup: groupIdx >= 0 ? line[groupIdx] || "" : "",
      serviceName: serviceIdx >= 0 ? line[serviceIdx] || "" : "",
      cost: costIdx >= 0 ? Number(String(line[costIdx] || "0").replace(",", ".")) : 0,
      currency: currencyIdx >= 0 ? line[currencyIdx] || "" : "",
    });
  }
  return out;
}

function resourceNameFromId(resourceId) {
  if (!resourceId) return "";
  const parts = resourceId.split("/").filter(Boolean);
  return parts[parts.length - 1] || resourceId;
}

function resourceGroupFromId(resourceId) {
  const match = String(resourceId).match(/resourcegroups\/([^/]+)/i);
  return match ? match[1] : "";
}

function dataDirs() {
  const nested = ["prod", "acc", "other"]
    .map((environment) => ({ environment, dir: path.join(rawDir, environment) }))
    .filter((item) => fs.existsSync(item.dir));
  if (nested.length) return nested;
  return [{ environment: "", dir: rawDir }];
}

function loadUsage() {
  const byMonth = new Map();
  for (const source of dataDirs()) {
    for (const file of listFiles(source.dir, (name) => /^usage-\d{4}-\d{2}(--.*)?\.json$/.test(name))) {
      const doc = readJson(file, null);
      if (!doc?.month) continue;
      const subscriptionEnvironment = doc.environment || source.environment || "";
      const rows = [];
      let currency = "";
      if (doc.status === "ok") {
        for (const page of doc.pages || []) {
          for (const row of rowsFromQueryPage(page)) {
            if (!currency && row.currency) currency = row.currency;
            rows.push({
              month: doc.month,
              resourceId: row.resourceId,
              resourceName: resourceNameFromId(row.resourceId),
              resourceGroup: resourceGroupFromId(row.resourceId),
              serviceName: row.serviceName,
              cost: row.cost,
              currency: row.currency,
              subscriptionEnvironment,
              fromApi: true,
            });
          }
        }
      }
      const existing = byMonth.get(doc.month);
      if (!existing) {
        byMonth.set(doc.month, {
          month: doc.month,
          status: doc.status || "error",
          error: doc.error || null,
          currency,
          rows,
        });
        continue;
      }
      if (doc.status === "ok") {
        existing.status = "ok";
        existing.rows.push(...rows);
        if (!existing.currency && currency) existing.currency = currency;
      } else if (existing.status !== "ok") {
        existing.status = doc.status || existing.status;
        existing.error = [existing.error, doc.error].filter(Boolean).join("\n") || null;
      }
    }
  }

  const portalDir = path.join(rawDir, "portal");
  for (const file of listFiles(portalDir, (name) => name.toLowerCase().endsWith(".csv"))) {
    const base = path.basename(file).toLowerCase();
    const environment = base.startsWith("acc") ? "acc" : base.startsWith("prod") ? "prod" : "";
    for (const row of rowsFromPortalCsv(file)) {
      row.subscriptionEnvironment = environment;
      const existing = byMonth.get(row.month);
      if (existing?.status === "ok" && existing.rows.some((item) => item.fromApi && item.subscriptionEnvironment === environment)) {
        continue;
      }
      if (!existing || existing.status !== "ok") {
        byMonth.set(row.month, {
          month: row.month,
          status: "ok",
          error: null,
          currency: row.currency || existing?.currency || "",
          rows: [],
        });
      }
      const bucket = byMonth.get(row.month);
      if (!bucket.currency && row.currency) bucket.currency = row.currency;
      bucket.rows.push(row);
    }
  }
  return [...byMonth.values()].sort((a, b) => a.month.localeCompare(b.month));
}

function bestRule(haystack, rules) {
  const text = haystack.toLowerCase();
  let best = null;
  for (const rule of rules) {
    const match = String(rule.match || "").toLowerCase();
    if (!match || !text.includes(match)) continue;
    if (!best || match.length > best.match.length) best = rule;
  }
  return best;
}

function classifyResource(resourceId, resourceName, rules, webapps) {
  const rule = bestRule(`${resourceId} ${resourceName}`, rules);
  const isPlan = /\/serverfarms\//i.test(resourceId);
  if (!isPlan) {
    if (!rule) return { environment: "unclassified", platform: "unclassified", hosts: [], sharedPlan: false };
    return {
      environment: rule.environment,
      platform: rule.platform,
      hosts: rule.hosts || [],
      sharedPlan: false,
    };
  }

  const apps = webapps.filter((app) => String(app.appServicePlanId || "").toLowerCase() === resourceId.toLowerCase());
  const appRules = apps.map((app) => bestRule(app.name || "", rules)).filter(Boolean);
  const platforms = new Set(appRules.map((item) => item.platform));
  const mixed = platforms.size > 1;
  if (mixed) {
    const envs = new Set(appRules.map((item) => item.environment));
    return {
      environment: envs.size === 1 ? [...envs][0] : "shared",
      platform: "other",
      hosts: appRules.flatMap((item) => item.hosts || []),
      sharedPlan: true,
    };
  }
  if (appRules.length && !rule) {
    const envs = new Set(appRules.map((item) => item.environment));
    const onlyPlatform = [...platforms][0] || "other";
    return {
      environment: envs.size === 1 ? [...envs][0] : "shared",
      platform: onlyPlatform,
      hosts: appRules.flatMap((item) => item.hosts || []),
      sharedPlan: false,
    };
  }
  if (rule) {
    return {
      environment: rule.environment,
      platform: rule.platform,
      hosts: rule.hosts || [],
      sharedPlan: false,
    };
  }
  return { environment: "unclassified", platform: "unclassified", hosts: [], sharedPlan: false };
}

function readList(dir, name) {
  const file = path.join(dir, name);
  if (!fs.existsSync(file)) return { rows: [], error: null, missing: true };
  const doc = readJson(file, null);
  if (!doc) return { rows: [], error: "onleesbaar", missing: false };
  if (doc.error) return { rows: [], error: doc.error, missing: false };
  if (!Array.isArray(doc)) return { rows: [], error: "geen lijst", missing: false };
  return { rows: doc, error: null, missing: false };
}

function loadWebapps() {
  const apps = [];
  const errors = [];
  let found = false;
  for (const source of dataDirs()) {
    const loaded = readList(source.dir, "webapps.json");
    if (loaded.missing) continue;
    found = true;
    if (loaded.error) errors.push(loaded.error);
    for (const app of loaded.rows) {
      apps.push({
        name: app.name || "",
        state: app.state || "",
        resourceGroup: app.resourceGroup || "",
        appServicePlanId: app.appServicePlanId || app.serverFarmId || "",
        hosts: app.enabledHostNames || app.hostNames || (app.defaultHostName ? [app.defaultHostName] : []),
        kind: "webapp",
        subscriptionEnvironment: source.environment,
      });
    }
  }
  return { apps, error: errors[0] || null, found };
}

function loadPlans() {
  const plans = [];
  for (const source of dataDirs()) {
    const loaded = readList(source.dir, "plans.json");
    for (const plan of loaded.rows) {
      plans.push({
        id: plan.id || "",
        name: plan.name || "",
        resourceGroup: plan.resourceGroup || "",
        sku: plan.sku?.name || plan.sku?.tier || "",
        subscriptionEnvironment: source.environment,
      });
    }
  }
  return plans;
}

function loadMysql() {
  const servers = [];
  const errors = [];
  for (const source of dataDirs()) {
    const loaded = readList(source.dir, "mysql.json");
    if (loaded.error) errors.push(loaded.error);
    for (const server of loaded.rows) {
      servers.push({
        name: server.name || "",
        state: server.state || "",
        resourceGroup: server.resourceGroup || "",
        hosts: server.fullyQualifiedDomainName ? [server.fullyQualifiedDomainName] : [],
        kind: "mysql",
        subscriptionEnvironment: source.environment,
      });
    }
  }
  return { servers, error: errors[0] || null };
}

function round(value) {
  return Math.round(value * 100) / 100;
}

function workflowIsScheduled(workflow) {
  if (!workflow) return null;
  const file = path.join(root, workflow);
  if (!fs.existsSync(file)) return false;
  const lines = fs.readFileSync(file, "utf8").split("\n");
  let inSchedule = false;
  for (const line of lines) {
    if (/^\s*#/.test(line)) continue;
    if (/schedule\s*:/.test(line)) {
      inSchedule = true;
      continue;
    }
    if (inSchedule && /^\S/.test(line)) inSchedule = false;
    if (inSchedule && /cron\s*:/.test(line)) return true;
  }
  return false;
}

function replacementExists(replacement) {
  if (!replacement) return false;
  if (replacement.startsWith("/api/cron/")) {
    const name = replacement.slice("/api/cron/".length).split("/")[0];
    return fs.existsSync(path.join(root, "src/pages/api/cron", name, "index.ts"));
  }
  if (replacement.startsWith("/api/")) {
    const rel = replacement.slice("/api/".length);
    return fs.existsSync(path.join(root, "src/pages/api", `${rel}.ts`));
  }
  return false;
}

function parseScheduler(file) {
  if (!fs.existsSync(file)) return [];
  const xml = fs.readFileSync(file, "utf8");
  const blocks = xml.match(/<task\b[\s\S]*?\/>/g) || [];
  return blocks.map((block) => {
    const attrs = {};
    for (const match of block.matchAll(/(\w+)="([^"]*)"/g)) attrs[match[1]] = match[2];
    let host = "";
    try {
      host = new URL(attrs.url || "").hostname.split(".")[0];
    } catch {
      host = "";
    }
    return {
      name: attrs.name || "",
      url: attrs.url || "",
      interval: attrs.interval || "",
      paused: attrs.paused === "true",
      port: attrs.port || "",
      host,
    };
  });
}

function activeInScheduler(task) {
  return Boolean(task) && task.paused !== true && task.port !== "-1";
}

function loadJobs(catalog) {
  const schedulerFile = path.join(root, "broncode/scheduler/scheduler.xml");
  const tasks = parseScheduler(schedulerFile);
  const evidenceScheduler = parseScheduler(path.join(dataDir, "evidence/scheduler.xml"));
  const requests = readJson(path.join(dataDir, "evidence/requests.json"), null);
  const requestUrls = Array.isArray(requests?.urls) ? requests.urls.map(String) : null;
  const logicFile = readJson(path.join(dataDir, "evidence/logic-apps.json"), null);
  const logicApps = Array.isArray(logicFile) ? logicFile : null;
  const matchedLogic = new Set();

  const jobs = [];
  const seenFiles = new Set();

  function seenLive(task, matchText, logicFragment) {
    if (logicApps && logicFragment) {
      const hits = logicApps.filter((app) => String(app.name).toLowerCase().includes(String(logicFragment).toLowerCase()));
      for (const hit of hits) matchedLogic.add(hit.name);
      if (hits.length) {
        return { seenLive: hits.some((app) => app.state === "Enabled"), evidenceSource: "logic-app" };
      }
      return { seenLive: false, evidenceSource: "logic-app" };
    }
    if (requestUrls) {
      const blob = `${task?.url || ""} ${matchText || ""}`.toLowerCase();
      const hit = requestUrls.some((url) => {
        const value = url.toLowerCase();
        if (task?.url && value.includes(task.url.split("?")[0].toLowerCase())) return true;
        return matchText && value.includes(String(matchText).toLowerCase());
      });
      return { seenLive: hit, evidenceSource: "requests" };
    }
    if (evidenceScheduler.length) {
      const found = evidenceScheduler.find((item) => item.name === task?.name);
      return { seenLive: activeInScheduler(found), evidenceSource: "scheduler" };
    }
    return { seenLive: null, evidenceSource: null };
  }

  function pushJob(partial) {
    const ported = replacementExists(partial.replacement);
    const replacementScheduled = workflowIsScheduled(partial.workflow);
    const evidence = seenLive(partial.task, partial.matchText, partial.logicApp);
    let gap = "";
    if (evidence.seenLive === true && partial.plan === "unknown") gap = "Actief, niet in het plan";
    else if (partial.plan === "port" && !ported) gap = "In het plan, nog niet geporteerd";
    else if (partial.plan === "port" && ported && replacementScheduled !== true) gap = "Geporteerd, nog niet ingepland";
    jobs.push({
      name: partial.name,
      source: partial.source,
      host: partial.host || "",
      url: partial.url || "",
      interval: partial.interval || "",
      paused: partial.paused ?? null,
      port: partial.port || "",
      plan: partial.plan,
      note: partial.note || "",
      replacement: partial.replacement || "",
      ported,
      replacementScheduled,
      seenLive: evidence.seenLive,
      evidenceSource: evidence.evidenceSource,
      gap,
    });
  }

  for (const task of tasks) {
    const meta = (catalog.tasks || []).find((item) => item.name === task.name) || {};
    const fileName = (task.url.match(/\/([^/?]+\.cfm)/) || [])[1];
    if (fileName) seenFiles.add(fileName.toLowerCase());
    pushJob({
      name: task.name,
      source: "scheduler",
      host: task.host,
      url: task.url,
      interval: task.interval,
      paused: task.paused,
      port: task.port,
      plan: meta.plan || "unknown",
      note: meta.note || "",
      replacement: meta.replacement || "",
      workflow: meta.workflow || null,
      logicApp: meta.logicApp || null,
      task,
      matchText: fileName || task.name,
    });
  }

  const catalogNames = new Set((catalog.files || []).map((item) => item.file.toLowerCase()));
  const cronFiles = walk(path.join(root, "broncode")).filter((file) => {
    if (!file.endsWith(".cfm")) return false;
    if (file.includes(`${path.sep}verwijssysteem${path.sep}`)) return false;
    const base = path.basename(file).toLowerCase();
    if (base === "test.cfm" && !catalogNames.has(base)) return false;
    return catalogNames.has(base) || file.includes(`${path.sep}cronjobs${path.sep}`);
  });

  for (const file of cronFiles) {
    const base = path.basename(file);
    if (seenFiles.has(base.toLowerCase())) continue;
    seenFiles.add(base.toLowerCase());
    const meta = (catalog.files || []).find((item) => item.file.toLowerCase() === base.toLowerCase()) || {};
    pushJob({
      name: base,
      source: "disk",
      host: "",
      url: path.relative(path.join(root, "broncode"), file),
      interval: "",
      paused: null,
      port: "",
      plan: meta.plan || "unknown",
      note: meta.note || "",
      replacement: meta.replacement || "",
      workflow: meta.workflow || null,
      logicApp: meta.logicApp || null,
      task: null,
      matchText: base,
    });
  }

  for (const extra of catalog.extra || []) {
    pushJob({
      name: extra.name,
      source: "catalog",
      host: extra.host || "",
      url: "",
      interval: extra.interval || "",
      paused: null,
      port: "",
      plan: extra.plan || "unknown",
      note: extra.note || "",
      replacement: extra.replacement || "",
      workflow: extra.workflow || null,
      logicApp: extra.logicApp || null,
      task: { name: extra.name, url: extra.replacement || "" },
      matchText: extra.name,
    });
  }

  if (logicApps) {
    for (const app of logicApps) {
      if (app.state !== "Enabled" || matchedLogic.has(app.name)) continue;
      pushJob({
        name: app.name,
        source: "logic-app",
        plan: "unknown",
        note: "Logic App staat aan en hoort bij geen taak in de catalogus.",
        logicApp: app.name,
        task: null,
        matchText: app.name,
      });
    }
  }

  if (!tasks.length && !(catalog.tasks || []).length) return jobs;

  if (!tasks.length) {
    for (const meta of catalog.tasks || []) {
      pushJob({
        name: meta.name,
        source: "catalog",
        host: "",
        url: "",
        interval: "",
        paused: null,
        port: "",
        plan: meta.plan || "unknown",
        note: meta.note || "",
        replacement: meta.replacement || "",
        workflow: meta.workflow || null,
        logicApp: meta.logicApp || null,
        task: { name: meta.name },
        matchText: meta.name,
      });
    }
  }

  return jobs;
}

function main() {
  const classification = readJson(path.join(dataDir, "classification.json"), { resources: [] });
  const rules = classification.resources || [];
  const { apps, error: webappError, found: webappsFound } = loadWebapps();
  const plans = loadPlans();
  const { servers, error: mysqlError } = loadMysql();
  const months = loadUsage();
  const currency = months.find((month) => month.currency)?.currency || "EUR";

  const lineItems = [];
  for (const month of months) {
    if (month.status !== "ok") continue;
    for (const row of month.rows) {
      const classified = classifyResource(row.resourceId, row.resourceName, rules, apps);
      if (classified.environment === "unclassified" && row.subscriptionEnvironment) {
        classified.environment = row.subscriptionEnvironment;
      }
      if (row.serviceName === "Bandwidth") classified.platform = "network";
      lineItems.push({
        month: month.month,
        monthStatus: month.status,
        resourceId: row.resourceId,
        resourceName: row.resourceName,
        resourceGroup: row.resourceGroup,
        serviceName: row.serviceName,
        cost: row.cost,
        environment: classified.environment,
        platform: classified.platform,
        hosts: classified.hosts,
        sharedPlan: classified.sharedPlan,
      });
    }
  }

  const resourceMap = new Map();
  for (const item of lineItems) {
    const key = (item.resourceId || `${item.resourceGroup}/${item.resourceName}`).toLowerCase();
    if (!resourceMap.has(key)) {
      resourceMap.set(key, {
        id: item.resourceId,
        name: item.resourceName,
        resourceGroup: item.resourceGroup,
        serviceName: item.serviceName,
        environment: item.environment,
        platform: item.platform,
        hosts: item.hosts,
        sharedPlan: item.sharedPlan,
        costs: {},
      });
    }
    const bucket = resourceMap.get(key);
    bucket.costs[item.month] = round((bucket.costs[item.month] || 0) + item.cost);
    if (item.cost > (bucket._top || 0)) {
      bucket.serviceName = item.serviceName;
      bucket.platform = item.platform;
      bucket._top = item.cost;
    }
  }
  const resources = [...resourceMap.values()]
    .map(({ _top, ...item }) => item)
    .sort((a, b) => Object.values(b.costs).reduce((s, n) => s + n, 0) - Object.values(a.costs).reduce((s, n) => s + n, 0));

  const planName = (id) => plans.find((plan) => plan.id.toLowerCase() === String(id).toLowerCase())?.name || "";
  const services = [
    ...apps.map((app) => {
      const classified = bestRule(app.name, rules);
      return {
        name: app.name,
        kind: "webapp",
        state: app.state,
        resourceGroup: app.resourceGroup,
        hosts: app.hosts,
        planName: planName(app.appServicePlanId),
        environment: classified?.environment || app.subscriptionEnvironment || "unclassified",
        platform: classified?.platform || "unclassified",
      };
    }),
    ...servers.map((server) => {
      const classified = bestRule(server.name, rules);
      return {
        name: server.name,
        kind: "mysql",
        state: server.state,
        resourceGroup: server.resourceGroup,
        hosts: server.hosts,
        planName: "",
        environment: classified?.environment || server.subscriptionEnvironment || "unclassified",
        platform: classified?.platform || "unclassified",
      };
    }),
    ...plans.map((plan) => {
      const classified = classifyResource(plan.id, plan.name, rules, apps);
      if (classified.environment === "unclassified" && plan.subscriptionEnvironment) {
        classified.environment = plan.subscriptionEnvironment;
      }
      return {
        name: plan.name,
        kind: "plan",
        state: plan.sku,
        resourceGroup: plan.resourceGroup,
        hosts: classified.hosts,
        planName: plan.name,
        environment: classified.environment,
        platform: classified.platform,
      };
    }),
  ];

  const catalog = readJson(path.join(dataDir, "job-catalog.json"), { tasks: [], files: [], extra: [] });
  const jobs = loadJobs(catalog);

  const notes = [];
  if (!webappsFound) {
    notes.push("Geen webapp-lijst. Gedeelde App Service-plannen zijn pas zichtbaar na probe.sh.");
  } else if (webappError) {
    notes.push("Webapp-lijst is mislukt. Gedeelde plannen zijn niet herkend.");
  }
  if (mysqlError) notes.push("MySQL-lijst is mislukt.");
  const missing2024 = !months.some((month) => month.month.startsWith("2024") && month.status === "ok");
  if (missing2024) notes.push("Geen kosten voor 2024 in de lokale bestanden. Retentie is vaak ongeveer 13 maanden.");
  const current = new Date().toISOString().slice(0, 7);
  if (months.some((month) => month.month === current)) {
    notes.push(`${current} is nog geen volledige maand.`);
  }
  const hasLiveEvidence =
    fs.existsSync(path.join(dataDir, "evidence/scheduler.xml")) ||
    fs.existsSync(path.join(dataDir, "evidence/requests.json")) ||
    fs.existsSync(path.join(dataDir, "evidence/logic-apps.json"));
  if (!hasLiveEvidence) {
    notes.push("Geen live Lucee-export, requestlog of Logic Apps-lijst. De kolom 'gezien' blijft leeg.");
  }
  const summary = {
    generatedAt: new Date().toISOString(),
    currency,
    months: months.map((month) => ({ month: month.month, status: month.status, error: month.error })),
    resources,
    lineItems: lineItems.map(({ monthStatus, ...item }) => item),
    services,
    jobs,
    notes,
  };

  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(path.join(dataDir, "summary.json"), JSON.stringify(summary, null, 2));
  console.log(
    `Wrote data/azure-costs/summary.json (${resources.length} resources, ${jobs.length} jobs, ${months.length} months)`
  );
}

main();
