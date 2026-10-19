import React, { useMemo } from "react";
import { Alert, Box, Paper, Table, TableBody, TableCell, TableHead, TableRow, Typography } from "@mui/material";
import type { CostSummary } from "~/server/azure-costs/types";
import { euro } from "./labels";
import { buildProjection, type ShutdownSettings } from "./scenario";

const SavingsReport: React.FC<{ summary: CostSummary; settings: ShutdownSettings }> = ({ summary, settings }) => {
  const currency = summary.currency || "EUR";
  const projection = useMemo(() => buildProjection(summary, settings), [summary, settings]);
  if (!projection) {
    return <Alert severity="warning">De twee productieplannen zijn niet te herkennen in het lokale kostenbestand.</Alert>;
  }

  const { facts } = projection;
  const money = (value: number) => euro(value, currency);
  const empty = projection.stopped.find((item) => item.emptyPlan);
  const others = projection.stopped.filter((item) => !item.emptyPlan && item.monthly >= 0.01);
  const freeStops = projection.stopped.filter((item) => !item.emptyPlan && item.monthly < 0.01).length;
  const ratioText = projection.usingJune
    ? "de maat van juni 2026"
    : `een gekozen verhouding van ${(projection.ratio * 100).toFixed(1)}%`;

  return (
    <Box>
      <Alert severity="info" sx={{ mb: 2 }}>
        Vanaf 1 januari 2027. {facts.livePlanName} gaat van {money(facts.liveLevel)} naar {money(projection.planTarget)} per maand ({ratioText}).
        {empty ? ` ${facts.emptyPlanName} gaat uit.` : ` ${facts.emptyPlanName} blijft aan.`}
        {" "}De overige aangevinkte diensten stoppen. Database, netwerk en de rest blijven op het niveau van juli–september ({money(projection.referenceMonthly)} nu, {money(projection.futureMonthly)} daarna).
      </Alert>

      <Box display="flex" gap={2} flexWrap="wrap" mb={2}>
        <Figure title="Nu per maand" value={money(projection.referenceMonthly)} note="juli–september 2026" />
        <Figure title="Vanaf januari 2027" value={money(projection.futureMonthly)} note="plan op de gekozen maat" />
        <Figure title="Besparing" value={money(projection.savingMonthly)} note={`${money(projection.savingYearly)} per jaar`} />
      </Box>

      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Waar de besparing vandaan komt</Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Aanpassing</TableCell>
              <TableCell align="right">Per maand</TableCell>
              <TableCell align="right">Per jaar</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            <TableRow>
              <TableCell>
                {facts.livePlanName} van {money(facts.liveLevel)} naar {money(projection.planTarget)}
              </TableCell>
              <TableCell align="right">{money(projection.planSaving)}</TableCell>
              <TableCell align="right">{money(projection.planSaving * 12)}</TableCell>
            </TableRow>
            {empty ? (
              <TableRow>
                <TableCell>
                  {empty.name} uit{facts.emptyHasSites ? "" : ", geen sites"}
                </TableCell>
                <TableCell align="right">{money(empty.monthly)}</TableCell>
                <TableCell align="right">{money(empty.monthly * 12)}</TableCell>
              </TableRow>
            ) : null}
            {others.map((service) => (
              <TableRow key={service.id}>
                <TableCell>{service.name} uit</TableCell>
                <TableCell align="right">{money(service.monthly)}</TableCell>
                <TableCell align="right">{money(service.monthly * 12)}</TableCell>
              </TableRow>
            ))}
            {freeStops > 0 ? (
              <TableRow>
                <TableCell>{freeStops} resources zonder eigen factuur stoppen mee</TableCell>
                <TableCell align="right">{money(0)}</TableCell>
                <TableCell align="right">{money(0)}</TableCell>
              </TableRow>
            ) : null}
            <TableRow>
              <TableCell><strong>Samen</strong></TableCell>
              <TableCell align="right"><strong>{money(projection.savingMonthly)}</strong></TableCell>
              <TableCell align="right"><strong>{money(projection.savingYearly)}</strong></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
};

function Figure({ title, value, note }: { title: string; value: string; note: string }) {
  return (
    <Paper sx={{ p: 2, flex: "1 1 220px" }}>
      <Typography variant="overline" color="text.secondary">{title}</Typography>
      <Typography variant="h4">{value}</Typography>
      <Typography variant="body2" color="text.secondary">{note}</Typography>
    </Paper>
  );
}

export default SavingsReport;
