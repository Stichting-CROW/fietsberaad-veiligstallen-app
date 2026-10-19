import React, { useMemo, useState } from "react";
import { Box, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import Chart from "../reports/Chart";
import type { CostSummary } from "~/server/azure-costs/types";
import { categoryTooltip, euro, monthShort } from "./labels";
import { buildActualMonths, readPlanFacts, type CostScope, type MonthBucket } from "./scenario";

const SCOPES: [CostScope, string][] = [
  ["both", "Productie en acceptatie"],
  ["prod", "Productie"],
  ["acc", "Acceptatie"],
];

const MonthlyReport: React.FC<{
  summary: CostSummary;
  scope: CostScope;
  onScope: (scope: CostScope) => void;
}> = ({ summary, scope, onScope }) => {
  const currency = summary.currency || "EUR";
  const months = useMemo(() => buildActualMonths(summary), [summary]);
  const facts = useMemo(() => readPlanFacts(summary), [summary]);
  const years = useMemo(() => [...new Set(months.map((item) => item.month.slice(0, 4)))].sort(), [months]);
  const [year, setYear] = useState(years.includes("2026") ? "2026" : years[years.length - 1] || "all");
  const money = (value: number) => euro(value, currency);

  if (!months.length) {
    return <Typography>Geen kosten.</Typography>;
  }

  const byYear = year === "all";
  const rows = byYear ? groupYears(months) : months.filter((item) => item.month.startsWith(year)).map(monthRow);
  const totalOf = (item: CostRow) => {
    if (scope === "acc") return item.acceptance;
    if (scope === "prod") return Math.round((item.appService + item.otherProd) * 100) / 100;
    return item.total;
  };
  const categories = rows.map((item) => item.label);
  const series = [
    scope !== "acc" ? { name: "App Service", data: rows.map((item) => item.appService) } : null,
    scope !== "acc" ? { name: "Overige productie", data: rows.map((item) => item.otherProd) } : null,
    scope !== "prod" ? { name: "Acceptatie", data: rows.map((item) => item.acceptance) } : null,
  ].filter((item): item is { name: string; data: number[] } => item !== null);
  const options = {
    chart: { stacked: true, toolbar: { show: false } },
    colors: scope === "acc" ? ["#6a1b9a"] : scope === "prod" ? ["#1565c0", "#00897b"] : ["#1565c0", "#00897b", "#6a1b9a"],
    xaxis: { categories },
    yaxis: { labels: { formatter: (value: number) => money(value) } },
    legend: { position: "top" as const },
    dataLabels: { enabled: false },
    tooltip: categoryTooltip(money),
  };
  const planNote = facts ? `${facts.planNames[0]} en ${facts.planNames[1]} samen. ` : "";

  return (
    <Box>
      <Box display="flex" gap={1} mb={2} flexWrap="wrap">
        {SCOPES.map(([value, text]) => (
          <Typography
            key={value}
            component="button"
            onClick={() => onScope(value)}
            sx={{
              border: 0,
              cursor: "pointer",
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              bgcolor: scope === value ? "primary.main" : "action.hover",
              color: scope === value ? "primary.contrastText" : "text.primary",
            }}
          >
            {text}
          </Typography>
        ))}
        {["all", ...years].map((item) => (
          <Typography
            key={item}
            component="button"
            onClick={() => setYear(item)}
            sx={{
              border: 0,
              cursor: "pointer",
              px: 1.5,
              py: 0.5,
              borderRadius: 1,
              bgcolor: year === item ? "primary.main" : "action.hover",
              color: year === item ? "primary.contrastText" : "text.primary",
            }}
          >
            {item === "all" ? "Alle jaren" : item}
          </Typography>
        ))}
      </Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Kosten</Typography>
        <Typography variant="body2" color="text.secondary" gutterBottom>
          Werkelijke kosten. {scope === "acc" ? "" : planNote}
          {byYear ? "Alle jaren zijn opgeteld per jaar. Een jaar met (deel) is nog niet afgesloten." : "Een maand met (deel) is nog niet afgesloten."}
        </Typography>
        <Chart type="bar" series={series} options={options} />
      </Paper>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>{byYear ? "Jaar" : "Maand"}</TableCell>
            {scope !== "acc" ? <TableCell align="right">App Service</TableCell> : null}
            {scope !== "acc" ? <TableCell align="right">Overige productie</TableCell> : null}
            {scope !== "prod" ? <TableCell align="right">Acceptatie</TableCell> : null}
            <TableCell align="right">Totaal</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((item) => (
            <TableRow key={item.key}>
              <TableCell>{item.label}</TableCell>
              {scope !== "acc" ? <TableCell align="right">{money(item.appService)}</TableCell> : null}
              {scope !== "acc" ? <TableCell align="right">{money(item.otherProd)}</TableCell> : null}
              {scope !== "prod" ? <TableCell align="right">{money(item.acceptance)}</TableCell> : null}
              <TableCell align="right">{money(totalOf(item))}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Box>
  );
};

type CostRow = {
  key: string;
  label: string;
  acceptance: number;
  appService: number;
  otherProd: number;
  total: number;
};

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

function monthRow(item: MonthBucket): CostRow {
  return {
    key: item.month,
    label: monthShort(item.month, item.partial),
    acceptance: item.acceptance,
    appService: item.appService,
    otherProd: item.otherProd,
    total: item.total,
  };
}

function groupYears(months: MonthBucket[]): CostRow[] {
  const byYear = new Map<string, MonthBucket[]>();
  for (const item of months) {
    const year = item.month.slice(0, 4);
    const list = byYear.get(year) ?? [];
    list.push(item);
    byYear.set(year, list);
  }
  return [...byYear.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([year, items]) => ({
    key: year,
    label: items.some((item) => item.partial) || items.length < 12 ? `${year} (deel)` : year,
    acceptance: round(items.reduce((sum, item) => sum + item.acceptance, 0)),
    appService: round(items.reduce((sum, item) => sum + item.appService, 0)),
    otherProd: round(items.reduce((sum, item) => sum + item.otherProd, 0)),
    total: round(items.reduce((sum, item) => sum + item.total, 0)),
  }));
}

export default MonthlyReport;
