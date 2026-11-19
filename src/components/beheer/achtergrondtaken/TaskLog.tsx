import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TablePagination,
  TableRow,
  TableSortLabel,
  TextField,
  Typography,
} from "@mui/material";
import toast from "react-hot-toast";
import {
  DurationCell,
  STATUS_FILTERS,
  StatusChip,
  TRIGGER_LABELS,
  formatDuration,
  formatWhen,
  statusLabel,
  type TaskDetail,
  type TaskRecord,
} from "./format";

type Props = {
  taskTypes: { type: string; label: string }[];
  refreshKey: number;
  onChanged: () => void;
};

function JsonBlock({ value }: { value: unknown }) {
  return (
    <Box
      component="pre"
      sx={{ m: 0, p: 1.5, maxHeight: 280, overflow: "auto", bgcolor: "grey.100", fontSize: 12, whiteSpace: "pre-wrap" }}
    >
      {value === null || value === undefined ? "—" : typeof value === "string" ? value : JSON.stringify(value, null, 2)}
    </Box>
  );
}

function DetailRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <TableRow>
      <TableCell sx={{ width: 160, color: "text.secondary" }}>{label}</TableCell>
      <TableCell>{children}</TableCell>
    </TableRow>
  );
}

const TaskLog: React.FC<Props> = ({ taskTypes, refreshKey, onChanged }) => {
  const [rows, setRows] = useState<TaskRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [sort, setSort] = useState<"created" | "duration">("created");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [type, setType] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [detail, setDetail] = useState<TaskDetail | null>(null);
  const [busy, setBusy] = useState(false);

  const labelOf = (taskType: string) => taskTypes.find((entry) => entry.type === taskType)?.label ?? taskType;

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort, dir });
    if (type) params.set("type", type);
    if (status) params.set("status", status);
    if (from) params.set("from", new Date(`${from}T00:00:00`).toISOString());
    if (to) params.set("to", new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000).toISOString());
    const res = await fetch(`/api/protected/background-tasks/tasks?${params.toString()}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Laden mislukt");
    setRows(json.rows);
    setTotal(json.total);
    setNow(new Date(json.now).getTime());
  }, [page, pageSize, sort, dir, type, status, from, to]);

  useEffect(() => {
    load().then(() => setError(null), (e) => setError(e instanceof Error ? e.message : String(e)));
  }, [load, refreshKey]);

  const openId = detail && (detail.status === "queued" || detail.status === "running") ? detail.id : null;
  useEffect(() => {
    if (openId === null) return;
    fetch(`/api/protected/background-tasks/tasks/${openId}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json: { task: TaskDetail } | null) => {
        if (json) setDetail((current) => (current?.id === openId ? json.task : current));
      })
      .catch(() => undefined);
  }, [refreshKey]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const timer = setInterval(() => setNow((value) => value + 1000), 1000);
    return () => clearInterval(timer);
  }, []);

  const openDetail = async (id: number) => {
    const res = await fetch(`/api/protected/background-tasks/tasks/${id}`);
    const json = await res.json();
    if (!res.ok) {
      toast.error(json.error || "Taak niet gevonden");
      return;
    }
    setDetail(json.task);
  };

  const act = async (id: number, action: "retry" | "release" | "cancel") => {
    setBusy(true);
    try {
      const res = await fetch(`/api/protected/background-tasks/tasks/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Actie mislukt");
      setDetail(json.task);
      toast.success(action === "cancel" ? "Taak geannuleerd" : "Taak staat weer in de wachtrij");
      onChanged();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggleSort = (column: "created" | "duration") => {
    if (sort === column) setDir(dir === "desc" ? "asc" : "desc");
    else {
      setSort(column);
      setDir("desc");
    }
    setPage(0);
  };

  const resetPage = <T,>(setter: (value: T) => void) => (value: T) => {
    setter(value);
    setPage(0);
  };

  return (
    <Box sx={{ display: "flex", flexDirection: "column", gap: 1 }}>
      <Typography variant="h6">Joblog</Typography>
      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap" }}>
        <TextField select size="small" label="Taak" value={type} onChange={(e) => resetPage(setType)(e.target.value)} sx={{ minWidth: 240 }}>
          <MenuItem value="">Alle taken</MenuItem>
          {taskTypes.map((entry) => (
            <MenuItem key={entry.type} value={entry.type}>{entry.label}</MenuItem>
          ))}
        </TextField>
        <TextField select size="small" label="Status" value={status} onChange={(e) => resetPage(setStatus)(e.target.value)} sx={{ minWidth: 160 }}>
          <MenuItem value="">Alle statussen</MenuItem>
          {STATUS_FILTERS.map((value) => (
            <MenuItem key={value} value={value}>{statusLabel(value)}</MenuItem>
          ))}
        </TextField>
        <TextField type="date" size="small" label="Van" value={from} onChange={(e) => resetPage(setFrom)(e.target.value)} InputLabelProps={{ shrink: true }} />
        <TextField type="date" size="small" label="Tot en met" value={to} onChange={(e) => resetPage(setTo)(e.target.value)} InputLabelProps={{ shrink: true }} />
      </Box>
      {error && <Alert severity="error">{error}</Alert>}
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>
              <TableSortLabel active={sort === "created"} direction={sort === "created" ? dir : "desc"} onClick={() => toggleSort("created")}>
                Aangemaakt
              </TableSortLabel>
            </TableCell>
            <TableCell>Gestart</TableCell>
            <TableCell>Taak</TableCell>
            <TableCell>Aanleiding</TableCell>
            <TableCell>Status</TableCell>
            <TableCell align="right">
              <TableSortLabel active={sort === "duration"} direction={sort === "duration" ? dir : "desc"} onClick={() => toggleSort("duration")}>
                Duur
              </TableSortLabel>
            </TableCell>
            <TableCell align="right">Pogingen</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id} hover sx={{ cursor: "pointer" }} onClick={() => void openDetail(row.id)}>
              <TableCell>{formatWhen(row.createdAt)}</TableCell>
              <TableCell>{formatWhen(row.startedAt)}</TableCell>
              <TableCell>{labelOf(row.type)}</TableCell>
              <TableCell>{TRIGGER_LABELS[row.trigger] ?? row.trigger}</TableCell>
              <TableCell><StatusChip task={row} /></TableCell>
              <TableCell align="right"><DurationCell task={row} now={now} /></TableCell>
              <TableCell align="right">{row.attempts}/{row.maxAttempts}</TableCell>
            </TableRow>
          ))}
          {rows.length === 0 && (
            <TableRow>
              <TableCell colSpan={7}>Geen taken gevonden.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>
      <TablePagination
        component="div"
        count={total}
        page={page}
        rowsPerPage={pageSize}
        rowsPerPageOptions={[25, 50, 100]}
        onPageChange={(_e, value) => setPage(value)}
        onRowsPerPageChange={(e) => {
          setPageSize(Number(e.target.value));
          setPage(0);
        }}
        labelRowsPerPage="Per pagina"
      />

      <Dialog open={detail !== null} onClose={() => setDetail(null)} maxWidth="md" fullWidth>
        {detail && (
          <>
            <DialogTitle>
              Taak {detail.id}: {labelOf(detail.type)} <StatusChip task={detail} />
            </DialogTitle>
            <DialogContent dividers>
              <Table size="small">
                <TableBody>
                  <DetailRow label="Type">{detail.type}</DetailRow>
                  <DetailRow label="Aanleiding">
                    {TRIGGER_LABELS[detail.trigger] ?? detail.trigger}
                    {detail.triggeredBy ? ` door ${detail.triggeredBy}` : ""}
                    {detail.scheduleKey ? ` (schema ${detail.scheduleKey})` : ""}
                  </DetailRow>
                  <DetailRow label="Aangemaakt">{formatWhen(detail.createdAt)}</DetailRow>
                  <DetailRow label="Uitvoeren vanaf">{formatWhen(detail.runAfter)}</DetailRow>
                  <DetailRow label="Gestart">{formatWhen(detail.startedAt)}</DetailRow>
                  <DetailRow label="Klaar">{formatWhen(detail.finishedAt)}</DetailRow>
                  <DetailRow label="Duur">
                    {detail.status === "running" ? <DurationCell task={detail} now={now} /> : formatDuration(detail.durationMs)}
                  </DetailRow>
                  <DetailRow label="Pogingen">{detail.attempts} van {detail.maxAttempts}</DetailRow>
                  <DetailRow label="Instantie">{detail.lockedBy ?? "—"}</DetailRow>
                  {detail.status === "running" && <DetailRow label="Lease tot">{formatWhen(detail.lockedUntil)}</DetailRow>}
                  {detail.dedupeKey && <DetailRow label="Dedupe-sleutel">{detail.dedupeKey}</DetailRow>}
                </TableBody>
              </Table>
              {detail.stuck && (
                <Alert severity="warning" sx={{ mt: 2 }}>
                  De lease is verlopen terwijl de taak nog op bezig staat. De instantie is waarschijnlijk gestopt.
                  Vrijgeven zet de taak terug in de wachtrij, annuleren sluit hem af.
                </Alert>
              )}
              {detail.lastError && (
                <>
                  <Typography variant="subtitle2" sx={{ mt: 2 }}>Fout</Typography>
                  <Box
                    component="pre"
                    sx={{ m: 0, p: 1.5, maxHeight: 280, overflow: "auto", bgcolor: "#fdecea", fontSize: 12, whiteSpace: "pre-wrap" }}
                  >
                    {detail.lastError}
                  </Box>
                </>
              )}
              <Typography variant="subtitle2" sx={{ mt: 2 }}>Invoer</Typography>
              <JsonBlock value={detail.payload} />
              <Typography variant="subtitle2" sx={{ mt: 2 }}>Resultaat</Typography>
              <JsonBlock value={detail.result} />
            </DialogContent>
            <DialogActions>
              {(detail.status === "failed" || detail.status === "cancelled") && (
                <Button disabled={busy} onClick={() => void act(detail.id, "retry")}>Opnieuw proberen</Button>
              )}
              {detail.stuck && (
                <Button disabled={busy} onClick={() => void act(detail.id, "release")}>Vrijgeven</Button>
              )}
              {(detail.status === "queued" || detail.status === "running") && (
                <Button disabled={busy} color="error" onClick={() => void act(detail.id, "cancel")}>Annuleren</Button>
              )}
              <Button variant="contained" onClick={() => setDetail(null)}>Sluiten</Button>
            </DialogActions>
          </>
        )}
      </Dialog>
    </Box>
  );
};

export default TaskLog;
