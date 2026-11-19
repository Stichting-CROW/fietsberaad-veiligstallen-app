import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Chip,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  FormControlLabel,
  IconButton,
  Paper,
  Switch,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { FiEdit2, FiPlay } from "react-icons/fi";
import { useSession } from "next-auth/react";
import toast from "react-hot-toast";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { LoadingSpinner } from "../common/LoadingSpinner";
import FietsberaadSuperadminAccessDenied from "../common/FietsberaadSuperadminAccessDenied";
import TaskLog from "./TaskLog";
import { DurationCell, StatusChip, formatDuration, formatWhen, type TaskRecord } from "./format";

type Schedule = {
  key: string;
  taskType: string;
  label: string;
  cron: string;
  cronDescription: string;
  timezone: string;
  enabled: boolean;
  nextRunAt: string | null;
  lastRun: TaskRecord | null;
  avgDurationMs: number | null;
};

type Overview = {
  now: string;
  settings: {
    paused: boolean;
    retentionDoneDays: number;
    retentionFailedDays: number;
    lastTickAt: string | null;
    lastTickSource: string | null;
  };
  internalTick: { enabled: boolean; running: boolean; reason: string };
  taskTypes: { type: string; label: string }[];
  schedules: Schedule[];
};

type Preview = { valid: boolean; error?: string; description?: string; nextRuns?: string[] };

const TICK_LATE_MS = 3 * 60_000;
const REFRESH_MS = 15_000;
const SOURCE_LABELS: Record<string, string> = {
  external: "externe klok",
  internal: "interne timer",
  "internal-dev": "interne timer (dev)",
};

async function send(url: string, method: string, body?: unknown) {
  const res = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json();
  if (!res.ok) throw new Error(json.error || "Actie mislukt");
  return json;
}

const AchtergrondtakenComponent: React.FC = () => {
  const { data: session } = useSession();
  const isSuperadmin = userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin);
  const [overview, setOverview] = useState<Overview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const [logRefresh, setLogRefresh] = useState(0);
  const [busy, setBusy] = useState(false);
  const [confirmRun, setConfirmRun] = useState<Schedule | null>(null);
  const [editing, setEditing] = useState<Schedule | null>(null);
  const [cronDraft, setCronDraft] = useState("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [retentionDone, setRetentionDone] = useState("");
  const [retentionFailed, setRetentionFailed] = useState("");

  const load = useCallback(async () => {
    const res = await fetch("/api/protected/background-tasks");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Laden mislukt");
    setOverview(json);
    setNow(new Date(json.now).getTime());
    return json as Overview;
  }, []);

  const refresh = useCallback(() => {
    load().then(() => setError(null), (e) => setError(e instanceof Error ? e.message : String(e)));
    setLogRefresh((value) => value + 1);
  }, [load]);

  useEffect(() => {
    if (!isSuperadmin) return;
    load().then(
      (json) => {
        setRetentionDone(String(json.settings.retentionDoneDays));
        setRetentionFailed(String(json.settings.retentionFailedDays));
      },
      (e) => setError(e instanceof Error ? e.message : String(e)),
    );
  }, [isSuperadmin, load]);

  useEffect(() => {
    if (!isSuperadmin) return;
    const timer = setInterval(() => {
      if (!document.hidden) refresh();
    }, REFRESH_MS);
    const onVisible = () => {
      if (!document.hidden) refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isSuperadmin, refresh]);

  useEffect(() => {
    const timer = setInterval(() => setNow((value) => value + 1000), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!editing) return;
    const handle = setTimeout(() => {
      const params = new URLSearchParams({ cron: cronDraft, timezone: editing.timezone });
      fetch(`/api/protected/background-tasks/schedules/preview?${params.toString()}`)
        .then((res) => res.json())
        .then((json: Preview) => setPreview(json))
        .catch(() => setPreview(null));
    }, 250);
    return () => clearTimeout(handle);
  }, [cronDraft, editing]);

  const withBusy = async (work: () => Promise<void>) => {
    setBusy(true);
    try {
      await work();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const runNow = (schedule: Schedule) =>
    withBusy(async () => {
      const json = await send(`/api/protected/background-tasks/schedules/${encodeURIComponent(schedule.key)}`, "POST");
      toast.success(`${schedule.label} gestart (taak ${json.taskId})`);
      setTimeout(refresh, 1000);
    });

  const setEnabled = (schedule: Schedule, enabled: boolean) =>
    withBusy(async () => {
      await send(`/api/protected/background-tasks/schedules/${encodeURIComponent(schedule.key)}`, "PATCH", { enabled });
      refresh();
    });

  const saveCron = () =>
    withBusy(async () => {
      if (!editing) return;
      await send(`/api/protected/background-tasks/schedules/${encodeURIComponent(editing.key)}`, "PATCH", { cron: cronDraft });
      toast.success("Schema opgeslagen");
      setEditing(null);
      refresh();
    });

  const saveSettings = (body: Record<string, unknown>, message: string) =>
    withBusy(async () => {
      await send("/api/protected/background-tasks/settings", "PATCH", body);
      toast.success(message);
      refresh();
    });

  const tickNow = () =>
    withBusy(async () => {
      const json = await send("/api/protected/background-tasks/tick", "POST");
      const summary = json.summary as { paused: boolean; scheduler: { enqueued: string[] } | null; started: unknown[]; stillRunning: unknown[] };
      toast.success(
        summary.paused
          ? "Gepauzeerd: niets gestart"
          : `Tick: ${summary.scheduler?.enqueued.length ?? 0} ingepland, ${summary.started.length} gestart, ${summary.stillRunning.length} nog bezig`,
      );
      refresh();
    });

  if (!isSuperadmin) return <FietsberaadSuperadminAccessDenied />;
  if (!overview) return error ? <Alert severity="error" sx={{ m: 3 }}>{error}</Alert> : <LoadingSpinner />;

  const { settings } = overview;
  const lastTick = settings.lastTickAt ? new Date(settings.lastTickAt).getTime() : null;
  const tickLate = lastTick === null || now - lastTick > TICK_LATE_MS;

  return (
    <Box sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography variant="h4">Achtergrondtaken</Typography>
      <Typography>
        Een externe klok roept elke minuut <code>/api/cron/tick</code> aan. Die tick plant de taken hieronder in en voert ze uit.
        Tijden staan in Nederlandse tijd.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}

      <Paper variant="outlined" sx={{ p: 2, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        <Chip
          color={tickLate ? "error" : "success"}
          label={
            lastTick === null
              ? "Nog geen tick ontvangen"
              : `Laatste tick: ${formatWhen(settings.lastTickAt)} (${SOURCE_LABELS[settings.lastTickSource ?? ""] ?? settings.lastTickSource})`
          }
        />
        <Typography variant="body2" color="text.secondary">
          Interne timer:{" "}
          {overview.internalTick.running
            ? `aan (${overview.internalTick.reason})`
            : overview.internalTick.enabled
              ? "ingesteld, maar niet actief op deze instantie (herstart de server)"
              : `uit (${overview.internalTick.reason})`}
        </Typography>
        <Box sx={{ flexGrow: 1 }} />
        <FormControlLabel
          control={
            <Switch
              checked={settings.paused}
              disabled={busy}
              color="warning"
              onChange={(e) =>
                void saveSettings({ paused: e.target.checked }, e.target.checked ? "Alle taken gepauzeerd" : "Taken lopen weer")
              }
            />
          }
          label="Alles pauzeren"
        />
        <Button variant="outlined" disabled={busy} onClick={() => void tickNow()}>
          Tick nu
        </Button>
      </Paper>

      {settings.paused && (
        <Alert severity="warning">
          Alle taken staan op pauze. Geplande runs worden overgeslagen. Nu uitvoeren werkt nog wel.
        </Alert>
      )}
      {tickLate && !settings.paused && (
        <Alert severity="error">
          Er is al meer dan 3 minuten geen tick binnengekomen. Controleer de externe klok die /api/cron/tick aanroept.
        </Alert>
      )}

      <Typography variant="h6">Geplande taken</Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Taak</TableCell>
            <TableCell>Schema</TableCell>
            <TableCell>Aan</TableCell>
            <TableCell>Laatste run</TableCell>
            <TableCell align="right">Duur</TableCell>
            <TableCell align="right">Gem. duur</TableCell>
            <TableCell>Volgende run</TableCell>
            <TableCell align="right">Acties</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {overview.schedules.map((schedule) => {
            const last = schedule.lastRun;
            const slow =
              last?.status === "done" && last.durationMs !== null && schedule.avgDurationMs !== null && last.durationMs > 2 * schedule.avgDurationMs;
            return (
              <TableRow key={schedule.key} sx={{ opacity: schedule.enabled ? 1 : 0.6 }}>
                <TableCell>
                  <Typography variant="body2">{schedule.label}</Typography>
                  <Typography variant="caption" color="text.secondary">{schedule.key}</Typography>
                </TableCell>
                <TableCell>
                  <Typography variant="body2">{schedule.cronDescription}</Typography>
                  <Typography variant="caption" color="text.secondary" sx={{ fontFamily: "monospace" }}>
                    {schedule.cron}{schedule.timezone !== "Europe/Amsterdam" ? ` (${schedule.timezone})` : ""}
                  </Typography>
                </TableCell>
                <TableCell>
                  <Switch size="small" checked={schedule.enabled} disabled={busy} onChange={(e) => void setEnabled(schedule, e.target.checked)} />
                </TableCell>
                <TableCell>
                  {last ? (
                    <Box sx={{ display: "flex", gap: 1, alignItems: "center" }}>
                      <StatusChip task={last} />
                      <Typography variant="body2">{formatWhen(last.startedAt ?? last.createdAt)}</Typography>
                    </Box>
                  ) : (
                    "—"
                  )}
                </TableCell>
                <TableCell align="right" sx={slow ? { color: "warning.main", fontWeight: 600 } : undefined}>
                  {last ? <DurationCell task={last} now={now} /> : "—"}
                </TableCell>
                <TableCell align="right">{formatDuration(schedule.avgDurationMs)}</TableCell>
                <TableCell>{schedule.enabled ? formatWhen(schedule.nextRunAt) : "uit"}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  <Tooltip title="Nu uitvoeren">
                    <span>
                      <IconButton
                        size="small"
                        disabled={busy}
                        onClick={() => (settings.paused ? setConfirmRun(schedule) : void runNow(schedule))}
                      >
                        <FiPlay />
                      </IconButton>
                    </span>
                  </Tooltip>
                  <Tooltip title="Schema wijzigen">
                    <IconButton
                      size="small"
                      onClick={() => {
                        setEditing(schedule);
                        setCronDraft(schedule.cron);
                        setPreview(null);
                      }}
                    >
                      <FiEdit2 />
                    </IconButton>
                  </Tooltip>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Paper variant="outlined" sx={{ p: 2, display: "flex", gap: 2, flexWrap: "wrap", alignItems: "center" }}>
        <Typography variant="subtitle2">Logregels bewaren</Typography>
        <TextField
          size="small"
          type="number"
          label="Klaar / geannuleerd (dagen)"
          value={retentionDone}
          onChange={(e) => setRetentionDone(e.target.value)}
          sx={{ width: 220 }}
        />
        <TextField
          size="small"
          type="number"
          label="Mislukt (dagen)"
          value={retentionFailed}
          onChange={(e) => setRetentionFailed(e.target.value)}
          sx={{ width: 160 }}
        />
        <Button
          variant="outlined"
          disabled={busy}
          onClick={() =>
            void saveSettings(
              { retentionDoneDays: Number(retentionDone), retentionFailedDays: Number(retentionFailed) },
              "Bewaartermijnen opgeslagen",
            )
          }
        >
          Opslaan
        </Button>
      </Paper>

      <TaskLog taskTypes={overview.taskTypes} refreshKey={logRefresh} onChanged={refresh} />

      <Dialog open={confirmRun !== null} onClose={() => setConfirmRun(null)}>
        <DialogTitle>Uitvoeren tijdens pauze</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Alle taken staan op pauze. Wilt u {confirmRun?.label} toch nu uitvoeren?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button
            color="warning"
            onClick={() => {
              const schedule = confirmRun;
              setConfirmRun(null);
              if (schedule) void runNow(schedule);
            }}
          >
            Toch uitvoeren
          </Button>
          <Button variant="contained" autoFocus onClick={() => setConfirmRun(null)}>
            Afbreken
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={editing !== null} onClose={() => setEditing(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Schema wijzigen: {editing?.label}</DialogTitle>
        <DialogContent>
          <DialogContentText sx={{ mb: 2 }}>
            Vijf velden: minuut, uur, dag van de maand, maand, weekdag. Tijdzone: {editing?.timezone}.
          </DialogContentText>
          <TextField
            fullWidth
            autoFocus
            label="Cron-expressie"
            value={cronDraft}
            onChange={(e) => {
              setCronDraft(e.target.value);
              setPreview(null);
            }}
            error={preview?.valid === false}
            helperText={preview?.valid === false ? preview.error : preview?.description}
            inputProps={{ style: { fontFamily: "monospace" } }}
          />
          {preview?.valid && preview.nextRuns && (
            <Box sx={{ mt: 2 }}>
              <Typography variant="subtitle2">Volgende 5 runs</Typography>
              <Box component="ul" sx={{ m: 0, pl: 3 }}>
                {preview.nextRuns.map((run) => (
                  <li key={run}>{formatWhen(run)}</li>
                ))}
              </Box>
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditing(null)}>Annuleren</Button>
          <Button variant="contained" disabled={busy || !preview?.valid || cronDraft === editing?.cron} onClick={() => void saveCron()}>
            Opslaan
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default AchtergrondtakenComponent;
