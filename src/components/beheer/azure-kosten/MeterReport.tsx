import React, { useMemo } from "react";
import { Alert, Box, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import Chart from "../reports/Chart";
import type { CostMeter, CostSummary } from "~/server/azure-costs/types";
import { categoryTooltip, euro, monthShort } from "./labels";

const BUCKETS: [string, string][] = [
  ["compute", "Compute"],
  ["storage", "Opslag"],
  ["backup", "Back-up"],
  ["io", "I/O"],
  ["other", "Overig"],
];

const BUCKET_LABEL = Object.fromEntries(BUCKETS);

function round(value: number): number {
  return Math.round(value * 100) / 100;
}

const MeterReport: React.FC<{ summary: CostSummary }> = ({ summary }) => {
  const currency = summary.currency || "EUR";
  const money = (value: number) => euro(value, currency);
  const mysql = useMemo(
    () => (summary.meters || []).filter((row) => row.serviceName === "Azure Database for MySQL"),
    [summary.meters]
  );

  if (!mysql.length) {
    return (
      <Alert severity="info">
        Nog geen MySQL-meters. Haal ze op met het portal-account via <code>bash scripts/azure-cost/export-meters.sh</code> en bouw daarna het overzicht opnieuw.
      </Alert>
    );
  }

  return (
    <Box>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        Productie, werkelijke kosten. MySQL-servers zijn samengeteld. De kolommen zijn compute, opslag, back-up en I/O. Een meter die daar niet in past blijft zichtbaar onder zijn Azure-naam.
      </Typography>
      <BucketSection
        title="MySQL"
        note="Alle productieservers samen."
        rows={mysql}
        money={money}
      />
    </Box>
  );
};

const BucketSection: React.FC<{
  title: string;
  note: string;
  rows: CostMeter[];
  money: (value: number) => string;
}> = ({ title, note, rows, money }) => {
  const names = [...new Set(rows.map((row) => row.resourceName))].sort();
  const months = [...new Set(rows.map((row) => row.month))].sort();
  const cell = (month: string, bucket: string) =>
    round(rows.filter((row) => row.month === month && row.bucket === bucket).reduce((sum, row) => sum + row.cost, 0));
  const series = BUCKETS.map(([bucket, label]) => ({
    name: label,
    data: months.map((month) => cell(month, bucket)),
  })).filter((item) => item.data.some((value) => value !== 0));
  const meterTotals = [...new Set(rows.map((row) => row.meter))].map((meter) => {
    const sample = rows.find((row) => row.meter === meter);
    return {
      meter,
      bucket: sample?.bucket || "other",
      total: round(rows.filter((row) => row.meter === meter).reduce((sum, row) => sum + row.cost, 0)),
    };
  }).filter((item) => item.total !== 0).sort((a, b) => b.total - a.total);
  const grand = round(meterTotals.reduce((sum, item) => sum + item.total, 0));

  return (
    <Box mb={4}>
      <Typography variant="h6" gutterBottom>{title}</Typography>
      <Typography variant="body2" color="text.secondary" gutterBottom>
        {note} {names.join(", ")}.
      </Typography>
      {series.length > 0 && (
        <Chart
          type="bar"
          series={series}
          style={{ minHeight: 320 }}
          options={{
            chart: { stacked: true, toolbar: { show: false } },
            xaxis: { categories: months.map((month) => monthShort(month)) },
            yaxis: { labels: { formatter: (value: number) => money(value) } },
            tooltip: categoryTooltip(money),
            dataLabels: { enabled: false },
            legend: { position: "bottom" },
          }}
        />
      )}
      <Paper variant="outlined" sx={{ overflowX: "auto", mt: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Maand</TableCell>
              {BUCKETS.map(([, label]) => <TableCell key={label} align="right">{label}</TableCell>)}
              <TableCell align="right">Totaal</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {months.map((month) => {
              const values = BUCKETS.map(([bucket]) => cell(month, bucket));
              const total = round(values.reduce((sum, value) => sum + value, 0));
              return (
                <TableRow key={month}>
                  <TableCell>{monthShort(month)}</TableCell>
                  {values.map((value, index) => <TableCell key={BUCKETS[index][0]} align="right">{money(value)}</TableCell>)}
                  <TableCell align="right">{money(total)}</TableCell>
                </TableRow>
              );
            })}
            <TableRow>
              <TableCell>Totaal</TableCell>
              {BUCKETS.map(([bucket]) => (
                <TableCell key={bucket} align="right">
                  {money(round(rows.filter((row) => row.bucket === bucket).reduce((sum, row) => sum + row.cost, 0)))}
                </TableCell>
              ))}
              <TableCell align="right">{money(grand)}</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Paper>
      <Paper variant="outlined" sx={{ overflowX: "auto", mt: 2 }}>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Meter</TableCell>
              <TableCell>Soort</TableCell>
              <TableCell align="right">Totaal</TableCell>
              <TableCell align="right">Aandeel</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {meterTotals.map((item) => (
              <TableRow key={item.meter}>
                <TableCell>{item.meter}</TableCell>
                <TableCell>{BUCKET_LABEL[item.bucket] || item.bucket}</TableCell>
                <TableCell align="right">{money(item.total)}</TableCell>
                <TableCell align="right">{grand ? `${Math.round((item.total / grand) * 1000) / 10}%` : ""}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
};

export default MeterReport;
