import React, { useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  MenuItem,
  Paper,
  Select,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import type { CostSummary } from "~/server/azure-costs/types";
import { euro } from "./labels";
import { buildProjection, listRemovable, listUnassigned, readPlanFacts, type ShutdownSettings } from "./scenario";

const ENV_LABEL: Record<string, string> = {
  prod: "Productie",
  acc: "Acceptatie",
};

const PLATFORM_LABEL: Record<string, string> = {
  core: "Core",
  api: "API",
  database: "Database",
  network: "Netwerk",
  other: "Overig",
  unclassified: "niet ingedeeld",
};

const SettingsPanel: React.FC<{
  summary: CostSummary;
  settings: ShutdownSettings;
  onChange: (settings: ShutdownSettings) => void;
}> = ({ summary, settings, onChange }) => {
  const currency = summary.currency || "EUR";
  const facts = readPlanFacts(summary);
  const projection = buildProjection(summary, settings);
  const removable = facts ? listRemovable(summary, facts) : [];
  const unassigned = facts ? listUnassigned(summary, facts) : [];
  const [draft, setDraft] = useState<string | null>(null);

  if (!facts || !projection) {
    return <Alert severity="warning">De twee productieplannen zijn niet te herkennen in het lokale kostenbestand.</Alert>;
  }

  const money = (value: number) => euro(value, currency);
  const percent = projection.ratio * 100;
  const text = draft ?? percent.toFixed(1);
  const sites = facts.sites
    .map((site) => `${site.name} (${PLATFORM_LABEL[site.platform] || site.platform})`)
    .join(", ");

  function commit(value: string) {
    const normalized = value.replace(",", ".").trim();
    if (!normalized || normalized === "." || normalized === "-") return;
    const parsed = Number(normalized);
    if (!Number.isFinite(parsed)) return;
    const ratio = Math.min(200, Math.max(0, parsed)) / 100;
    onChange({ ...settings, ratio });
  }

  function toggle(id: string, keep: boolean) {
    const excluded = new Set(settings.excluded);
    if (keep) excluded.add(id);
    else excluded.delete(id);
    onChange({ ...settings, excluded: [...excluded] });
  }

  function assign(id: string, stop: boolean) {
    const chosen = new Set(settings.stoppedUnclassified);
    if (stop) chosen.add(id);
    else chosen.delete(id);
    onChange({ ...settings, stoppedUnclassified: [...chosen] });
  }

  return (
    <Box>
      <Paper sx={{ p: 2, mb: 2 }}>
        <Typography variant="h6">Verhouding productieplan</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
          {facts.livePlanName} kostte in juni 2026 {money(facts.juneLevel)}. In juli–september was dat {money(facts.liveLevel)}.
          De standaardverhouding is {(facts.defaultRatio * 100).toFixed(1)}%. Dat is de maat van vóór de vergroting, niet een verdeling van de factuur over ColdFusion en Next.js.
          {sites ? ` Sites op dit plan: ${sites}.` : ""}
        </Typography>
        <Box display="flex" gap={2} alignItems="center" flexWrap="wrap">
          <TextField
            size="small"
            label="Percentage van juli–september"
            type="number"
            value={text}
            onChange={(event) => {
              setDraft(event.target.value);
              commit(event.target.value);
            }}
            onBlur={() => setDraft(null)}
            inputProps={{ min: 0, max: 200, step: 0.1 }}
            sx={{ width: 280 }}
          />
          <Button
            variant="outlined"
            onClick={() => {
              setDraft(null);
              onChange({ ...settings, ratio: null });
            }}
          >
            Juni 2026
          </Button>
        </Box>
        <Typography variant="body2" sx={{ mt: 2 }}>
          Vanaf 1 januari 2027 kost {facts.livePlanName} {money(projection.planTarget)} per maand.
          {projection.usingJune ? " Dit is de junimaat." : ` Dit wijkt af van juni 2026 (${(facts.defaultRatio * 100).toFixed(1)}%).`}
        </Typography>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6">Diensten die kunnen stoppen</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 1 }}>
          Aangevinkt telt mee in de besparing vanaf 1 januari 2027. Uitvinken laat de dienst doorlopen.
          Het lege productieplan staat standaard aan. Productie-MySQL, netwerk en de overige productiediensten blijven aan en staan niet in deze lijst.
          De keuzes blijven in deze browser bewaard.
        </Typography>
        {removable.map((service) => {
          const checked = !settings.excluded.includes(service.id);
          const caption = service.emptyPlan
            ? (facts.emptyHasSites ? "productieplan" : "leeg productieplan, geen sites")
            : `${ENV_LABEL[service.environment] || service.environment} · ${service.serviceName}`;
          return (
            <FormControlLabel
              key={service.id}
              sx={{ display: "flex", alignItems: "flex-start", ml: 0, my: 0.5 }}
              control={(
                <Checkbox
                  checked={checked}
                  onChange={(event) => toggle(service.id, !event.target.checked)}
                  sx={{ pt: 0.2 }}
                />
              )}
              label={(
                <Box>
                  <Typography variant="body2">{service.name}</Typography>
                  <Typography variant="caption" color="text.secondary">
                    {caption} · {money(service.monthly)} per maand
                  </Typography>
                </Box>
              )}
            />
          );
        })}
      </Paper>

      <Paper sx={{ p: 2, mt: 2 }}>
        <Typography variant="h6">Nog niet ingedeeld</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
          {unassigned.length} productieresources hebben geen categorie. Ze blijven draaien tot je ze op Stopt zet.
          Het lege productieplan hoort bij dezelfde groep, staat hierboven en gaat standaard uit.
          Acceptatie staat daar ook en telt standaard mee.
        </Typography>
        <Table size="small">
          <TableHead>
            <TableRow>
              <TableCell>Naam</TableCell>
              <TableCell>Dienst</TableCell>
              <TableCell align="right">Per maand</TableCell>
              <TableCell>Na ColdFusion</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {unassigned.map((service) => (
              <TableRow key={service.id}>
                <TableCell>{service.name}</TableCell>
                <TableCell>{service.serviceName}</TableCell>
                <TableCell align="right">{money(service.monthly)}</TableCell>
                <TableCell>
                  <Select
                    size="small"
                    value={settings.stoppedUnclassified.includes(service.id) ? "stop" : "keep"}
                    onChange={(event) => assign(service.id, event.target.value === "stop")}
                  >
                    <MenuItem value="keep">Blijft draaien</MenuItem>
                    <MenuItem value="stop">Stopt</MenuItem>
                  </Select>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Box>
  );
};

export default SettingsPanel;
