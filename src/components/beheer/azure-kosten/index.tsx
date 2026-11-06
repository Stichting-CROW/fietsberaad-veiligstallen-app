import React, { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  FormControl,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Typography,
} from "@mui/material";
import { useSession } from "next-auth/react";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { LoadingSpinner } from "../common/LoadingSpinner";
import FietsberaadSuperadminAccessDenied from "../common/FietsberaadSuperadminAccessDenied";
import Chart from "../reports/Chart";
import type { CostJob, CostLine, CostResource, CostSummary, RunningService } from "~/server/azure-costs/types";
import SavingsReport from "./SavingsReport";
import MonthlyReport from "./MonthlyReport";
import MeterReport from "./MeterReport";
import SettingsPanel from "./SettingsPanel";
import { categoryTooltip, euro as formatEuro, seriesColor } from "./labels";
import { type CostScope, type ShutdownSettings } from "./scenario";
import { emptyShutdownSettings, loadShutdownSettings, saveShutdownSettings } from "./settings";

const ENV_LABEL: Record<string, string> = {
  prod: "Productie",
  acc: "Acceptatie",
  shared: "Gedeeld",
  unclassified: "Niet ingedeeld",
};

const PLATFORM_LABEL: Record<string, string> = {
  core: "Core",
  api: "API",
  database: "Database",
  network: "Netwerk",
  other: "Overig",
  unclassified: "Niet ingedeeld",
};

const PLAN_LABEL: Record<string, string> = {
  port: "Porteren",
  retire: "Uitfaseren",
  "out-of-scope": "Buiten scope",
  unknown: "Onbekend",
};

function label(map: Record<string, string>, value: string): string {
  return map[value] || value;
}

function euro(value: number, currency: string): string {
  return formatEuro(value, currency);
}

function csvCell(value: string): string {
  if (/[",\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function yearOf(month: string): string {
  return month.slice(0, 4);
}

function resourceTotal(resource: CostResource, year: string): number {
  return Object.entries(resource.costs).reduce((sum, [month, cost]) => {
    if (year !== "all" && !month.startsWith(year)) return sum;
    return sum + cost;
  }, 0);
}

function stacked(items: CostLine[]) {
  const category = (item: CostLine) => item.serviceName || "onbekend";
  const months = [...new Set(items.map((item) => item.month))].sort();
  const names = [...new Set(items.map(category))].sort();
  const series = names.map((name) => ({
    name,
    data: months.map((month) => {
      const total = items
        .filter((item) => item.month === month && category(item) === name)
        .reduce((sum, item) => sum + item.cost, 0);
      return Math.round(total * 100) / 100;
    }),
  }));
  return { months, series: series.filter((serie) => serie.data.some((value) => value !== 0)) };
}

function chartOptions(categories: string[], currency: string, names: string[]) {
  return {
    chart: { stacked: true, toolbar: { show: false } },
    colors: names.map(seriesColor),
    xaxis: { categories },
    yaxis: {
      labels: {
        formatter: (value: number) => euro(value, currency),
      },
    },
    legend: { position: "top" as const },
    dataLabels: { enabled: false },
    tooltip: categoryTooltip((value) => euro(value, currency)),
  };
}

const PIE_HEIGHT = 520;
const MONTHLY_HEIGHT = 600;

function serviceTotals(items: CostLine[], environment: "prod" | "acc") {
  const totals = new Map<string, number>();
  for (const item of items) {
    if (item.environment !== environment) continue;
    const name = item.serviceName || "onbekend";
    totals.set(name, (totals.get(name) ?? 0) + item.cost);
  }
  return [...totals.entries()]
    .map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 }))
    .filter((item) => item.value > 0)
    .sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, "nl"));
}

function yesNo(value: boolean | null): string {
  if (value === null) return "—";
  return value ? "ja" : "nee";
}

const AzureKostenComponent: React.FC = () => {
  const { data: session } = useSession();
  const isSuperadmin = userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<CostSummary | null>(null);
  const [tab, setTab] = useState(0);
  const [year, setYear] = useState("all");
  const [scope, setScope] = useState<CostScope>("both");
  const [tableService, setTableService] = useState("all");
  const [settings, setSettings] = useState<ShutdownSettings>(emptyShutdownSettings);
  const [settingsReady, setSettingsReady] = useState(false);

  useEffect(() => {
    if (!isSuperadmin) return;
    let cancelled = false;
    type Payload = { available?: boolean; summary?: CostSummary; error?: string };
    void fetch("/api/protected/azure-costs")
      .then(async (res) => {
        const json = (await res.json()) as Payload;
        if (!res.ok) throw new Error(json.error || "Laden mislukt");
        if (!cancelled) setSummary(json.available && json.summary ? json.summary : null);
      })
      .catch((err: Error) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isSuperadmin]);

  useEffect(() => {
    setSettings(loadShutdownSettings());
    setSettingsReady(true);
  }, []);

  useEffect(() => {
    if (settingsReady) saveShutdownSettings(settings);
  }, [settings, settingsReady]);

  const years = useMemo(() => {
    const found = new Set<string>();
    for (const month of summary?.months || []) {
      if (month.status === "ok") found.add(yearOf(month.month));
    }
    return [...found].sort();
  }, [summary]);

  const filteredResources = useMemo(() => {
    return (summary?.resources || []).filter((item) => {
      if (item.environment !== "prod" && item.environment !== "acc") return false;
      if (year !== "all" && !Object.keys(item.costs).some((month) => month.startsWith(year))) return false;
      return true;
    });
  }, [summary, year]);

  const tableResources = useMemo(() => {
    return filteredResources.filter((item) => {
      if (tableService !== "all" && item.serviceName !== tableService) return false;
      return true;
    });
  }, [filteredResources, tableService]);

  const serviceOptions = useMemo(() => {
    return [...new Set((summary?.resources || []).map((item) => item.serviceName).filter(Boolean))].sort();
  }, [summary]);

  const pieLines = useMemo(() => {
    return (summary?.lineItems || []).filter((item) => {
      if (year !== "all" && !item.month.startsWith(year)) return false;
      return item.environment === "prod" || item.environment === "acc";
    });
  }, [summary, year]);

  const byProduction = useMemo(() => stacked(pieLines.filter((item) => item.environment === "prod")), [pieLines]);
  const byAcceptance = useMemo(() => stacked(pieLines.filter((item) => item.environment === "acc")), [pieLines]);

  if (!isSuperadmin) return <FietsberaadSuperadminAccessDenied />;
  if (loading) return <LoadingSpinner />;
  if (error) return <Alert severity="error">{error}</Alert>;
  if (!summary) {
    return (
      <Box p={2}>
        <Typography variant="h5" gutterBottom>Azure-kosten</Typography>
        <Alert severity="info">
          Er is nog geen lokaal kostenoverzicht. De cijfers, app-namen en plannen blijven buiten git.
          Zie scripts/azure-cost/README.md: eerst probe.sh of een portal-export, daarna build-summary.mjs.
        </Alert>
      </Box>
    );
  }

  const currency = summary.currency || "EUR";

  function downloadCsv() {
    const headers = ["Naam", "Resourcegroep", "Dienst", "Omgeving", "Categorie", "Hosts", "Gedeeld plan", ...years];
    const lines = [headers.join(",")];
    for (const resource of tableResources) {
      lines.push(
        [
          resource.name,
          resource.resourceGroup,
          resource.serviceName,
          label(ENV_LABEL, resource.environment),
          label(PLATFORM_LABEL, resource.platform),
          resource.hosts.join(" "),
          resource.sharedPlan ? "ja" : "nee",
          ...years.map((item) => String(Math.round(resourceTotal(resource, item) * 100) / 100)),
        ].map((value) => csvCell(String(value))).join(",")
      );
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "azure-kosten.csv";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Box p={2}>
      <Typography variant="h5" gutterBottom>Azure-kosten</Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Lokaal overzicht van {summary.generatedAt}. Cijfers, app-namen en plannen staan niet in git.
      </Typography>
      {summary.notes.filter((note) => !note.includes("hebben nog geen platform") && !note.includes("export-meters")).map((note) => (
        <Alert key={note} severity="info" sx={{ mb: 1 }}>{note}</Alert>
      ))}
      <Tabs value={tab} onChange={(_, value: number) => setTab(value)} sx={{ mb: 2 }}>
        <Tab label="Besparing" />
        <Tab label="Kosten" />
        <Tab label="Opbouw" />
        <Tab label="Detail" />
        <Tab label="Instellingen" />
      </Tabs>
      {tab === 0 && <SavingsReport summary={summary} settings={settings} />}
      {tab === 1 && <MonthlyReport summary={summary} scope={scope} onScope={setScope} />}
      {tab === 2 && <MeterReport summary={summary} />}
      {tab === 4 && <SettingsPanel summary={summary} settings={settings} onChange={setSettings} />}
      {tab === 3 && (
      <Box>
      <Box display="flex" gap={2} flexWrap="wrap" my={2}>
        <Filter label="Jaar" value={year} onChange={setYear} options={[["all", "Alle"], ...years.map((item) => [item, item] as [string, string])]} />
        <Button variant="outlined" onClick={downloadCsv}>CSV</Button>
      </Box>

      {pieLines.length > 0 && (
        <Box display="grid" gridTemplateColumns={{ xs: "1fr", md: "1fr 1fr" }} gap={2} mb={2} alignItems="stretch">
          <IntervalPie
            title="Productie per dienst"
            interval={year === "all" ? "Totaal" : year}
            totals={serviceTotals(pieLines, "prod")}
            currency={currency}
          />
          <IntervalPie
            title="Acceptatie per dienst"
            interval={year === "all" ? "Totaal" : year}
            totals={serviceTotals(pieLines, "acc")}
            currency={currency}
          />
        </Box>
      )}
      {byProduction.months.length > 0 && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6">Productie per dienst</Typography>
          <Chart type="bar" height={MONTHLY_HEIGHT} series={byProduction.series} options={chartOptions(byProduction.months, currency, byProduction.series.map((item) => item.name))} />
        </Paper>
      )}
      {byAcceptance.months.length > 0 && (
        <Paper sx={{ p: 2, mb: 2 }}>
          <Typography variant="h6">Acceptatie per dienst</Typography>
          <Chart type="bar" height={MONTHLY_HEIGHT} series={byAcceptance.series} options={chartOptions(byAcceptance.months, currency, byAcceptance.series.map((item) => item.name))} />
        </Paper>
      )}
      {byProduction.months.length === 0 && byAcceptance.months.length === 0 && (
        <Alert severity="warning" sx={{ mb: 2 }}>Nog geen maandbedragen. Draai de export of leg een portal-CSV neer.</Alert>
      )}

      <Typography variant="h6">Resources</Typography>
      <Box display="flex" gap={2} flexWrap="wrap" my={2}>
        <Filter label="Dienst" value={tableService} onChange={setTableService} options={[["all", "Alle"], ...serviceOptions.map((item) => [item, item] as [string, string])]} />
      </Box>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Naam</TableCell>
            <TableCell>Omgeving</TableCell>
            <TableCell>Categorie</TableCell>
            <TableCell>Hosts</TableCell>
            <TableCell>Dienst</TableCell>
            {years.map((item) => <TableCell key={item} align="right">{item}</TableCell>)}
          </TableRow>
        </TableHead>
        <TableBody>
          {tableResources.map((resource) => (
            <TableRow key={resource.id || resource.name}>
              <TableCell>{resource.name}{resource.sharedPlan ? " (gedeeld plan)" : ""}</TableCell>
              <TableCell>{label(ENV_LABEL, resource.environment)}</TableCell>
              <TableCell>{label(PLATFORM_LABEL, resource.platform)}</TableCell>
              <TableCell>{resource.hosts.join(", ")}</TableCell>
              <TableCell>{resource.serviceName}</TableCell>
              {years.map((item) => (
                <TableCell key={item} align="right">{euro(resourceTotal(resource, item), currency)}</TableCell>
              ))}
            </TableRow>
          ))}
          <TableRow>
            <TableCell sx={{ fontWeight: 700 }}>Totaal</TableCell>
            <TableCell />
            <TableCell />
            <TableCell />
            <TableCell />
            {years.map((item) => (
              <TableCell key={item} align="right" sx={{ fontWeight: 700 }}>
                {euro(tableResources.reduce((sum, resource) => sum + resourceTotal(resource, item), 0), currency)}
              </TableCell>
            ))}
          </TableRow>
        </TableBody>
      </Table>

      <Typography variant="h6" sx={{ mt: 3 }}>Wat draait</Typography>
      <ServiceTable services={summary.services.filter((service) => service.environment === "prod" || service.environment === "acc")} />

      <Typography variant="h6" sx={{ mt: 3 }}>ColdFusion-taken</Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Gezien komt uit de productie-Logic Apps. Acceptatie-Logic Apps tellen daar niet in mee.
      </Typography>
      <JobTable jobs={summary.jobs} />
      </Box>
      )}
    </Box>
  );
};

function IntervalPie({
  title,
  interval,
  totals,
  currency,
}: {
  title: string;
  interval: string;
  totals: { name: string; value: number }[];
  currency: string;
}) {
  if (!totals.length) {
    return (
      <Paper sx={{ p: 2, minWidth: 0, height: "100%" }}>
        <Typography variant="h6">{title}</Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>{interval}</Typography>
        <Box sx={{ height: PIE_HEIGHT, display: "flex", alignItems: "center" }}>
          <Typography color="text.secondary">Geen kosten in deze periode.</Typography>
        </Box>
      </Paper>
    );
  }
  const options = {
    chart: { type: "pie" as const },
    labels: totals.map((item) => item.name),
    colors: totals.map((item) => seriesColor(item.name)),
    legend: { show: false },
    dataLabels: {
      enabled: true,
      style: { fontSize: "14px", colors: totals.map(() => "#000") },
      dropShadow: { enabled: false },
      formatter: (_value: number, opts: { seriesIndex: number; w: { globals: { labels: string[]; series: number[] } } }) => {
        const name = opts.w.globals.labels[opts.seriesIndex] ?? "";
        const amount = opts.w.globals.series[opts.seriesIndex] ?? 0;
        return [name, euro(amount, currency)];
      },
    },
    plotOptions: { pie: { customScale: 0.92, dataLabels: { minAngleToShowLabel: 12 } } },
    tooltip: { y: { formatter: (value: number) => euro(value, currency) } },
    stroke: { width: 1, colors: ["#fff"] },
  };
  const chartKey = `${title}|${interval}|${totals.map((item) => `${item.name}:${item.value}`).join("|")}`;
  return (
    <Paper sx={{ p: 2, minWidth: 0, height: "100%" }}>
      <Typography variant="h6">{title}</Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>{interval}</Typography>
      <Box sx={{ height: PIE_HEIGHT }}>
        <Chart
          key={chartKey}
          type="pie"
          height={PIE_HEIGHT}
          series={totals.map((item) => item.value)}
          options={options}
        />
      </Box>
      <Box component="ul" sx={{ listStyle: "none", display: "flex", flexWrap: "wrap", gap: 1, m: 0, mt: 1, p: 0 }}>
        {totals.map((item) => (
          <Box component="li" key={item.name} sx={{ display: "flex", alignItems: "center", gap: 0.75, fontSize: 14 }}>
            <Box sx={{ width: 12, height: 12, borderRadius: "50%", bgcolor: seriesColor(item.name), flex: "0 0 auto" }} />
            {item.name}: {euro(item.value, currency)}
          </Box>
        ))}
      </Box>
    </Paper>
  );
}

function Filter({
  label: caption,
  value,
  onChange,
  options,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: [string, string][];
}) {
  return (
    <FormControl size="small" sx={{ minWidth: 160 }}>
      <InputLabel>{caption}</InputLabel>
      <Select label={caption} value={value} onChange={(event) => onChange(event.target.value)}>
        {options.map(([option, text]) => (
          <MenuItem key={option} value={option}>{text}</MenuItem>
        ))}
      </Select>
    </FormControl>
  );
}

function ServiceTable({ services }: { services: RunningService[] }) {
  if (!services.length) {
    return <Alert severity="info">Nog geen inventaris. Draai scripts/azure-cost/probe.sh.</Alert>;
  }
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Naam</TableCell>
          <TableCell>Soort</TableCell>
          <TableCell>Status</TableCell>
          <TableCell>Omgeving</TableCell>
          <TableCell>Categorie</TableCell>
          <TableCell>Hosts</TableCell>
          <TableCell>Plan</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {services.map((service) => (
          <TableRow key={`${service.kind}-${service.name}`}>
            <TableCell>{service.name}</TableCell>
            <TableCell>{service.kind}</TableCell>
            <TableCell>{service.state || "—"}</TableCell>
            <TableCell>{label(ENV_LABEL, service.environment)}</TableCell>
            <TableCell>{label(PLATFORM_LABEL, service.platform)}</TableCell>
            <TableCell>{service.hosts.join(", ")}</TableCell>
            <TableCell>{service.planName}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

function JobTable({ jobs }: { jobs: CostJob[] }) {
  if (!jobs.length) {
    return <Alert severity="info">Geen taken. job-catalog.json ontbreekt of broncode is niet aanwezig.</Alert>;
  }
  return (
    <Table size="small">
      <TableHead>
        <TableRow>
          <TableCell>Taak</TableCell>
          <TableCell>Bron</TableCell>
          <TableCell>Host</TableCell>
          <TableCell>Plan</TableCell>
          <TableCell>Geporteerd</TableCell>
          <TableCell>Ingepland</TableCell>
          <TableCell>Gezien</TableCell>
          <TableCell>Verschil</TableCell>
        </TableRow>
      </TableHead>
      <TableBody>
        {jobs.map((job) => (
          <TableRow key={`${job.source}-${job.name}-${job.url}`} sx={job.gap ? { backgroundColor: "rgba(237, 108, 2, 0.08)" } : undefined}>
            <TableCell>
              {job.name}
              {job.note ? <Typography variant="caption" display="block">{job.note}</Typography> : null}
            </TableCell>
            <TableCell>{job.source}</TableCell>
            <TableCell>{job.host || "—"}</TableCell>
            <TableCell>{label(PLAN_LABEL, job.plan)}</TableCell>
            <TableCell>{job.replacement ? (job.ported ? "ja" : "nee") : "—"}</TableCell>
            <TableCell>{yesNo(job.replacementScheduled)}</TableCell>
            <TableCell>{yesNo(job.seenLive)}</TableCell>
            <TableCell>{job.gap || "—"}</TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}

export default AzureKostenComponent;
