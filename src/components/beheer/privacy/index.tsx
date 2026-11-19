import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogContentText,
  DialogTitle,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Typography,
} from "@mui/material";
import { useSession } from "next-auth/react";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { LoadingSpinner } from "../common/LoadingSpinner";
import FietsberaadSuperadminAccessDenied from "../common/FietsberaadSuperadminAccessDenied";

type RunSummary = {
  id: number;
  mode: "dry-run" | "write";
  status: string;
  startedBy: string | null;
  startedAt: string;
  finishedAt: string | null;
  currentAction: string | null;
  logText: string | null;
  errorText: string | null;
};

type ActionRow = {
  id: number;
  actionKey: string;
  heading: string;
  rowsMatched: number;
  rowsChanged: number;
  status: string;
  detail: string | null;
};

type Detail = { run: RunSummary; actions: ActionRow[] };

function formatWhen(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString("nl-NL");
}

const PrivacyBeheerComponent: React.FC = () => {
  const { data: session } = useSession();
  const isSuperadmin = userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [writesEnabled, setWritesEnabled] = useState(false);
  const [appEnv, setAppEnv] = useState("");
  const [runs, setRuns] = useState<RunSummary[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [confirm, setConfirm] = useState("");
  const [writeCode, setWriteCode] = useState("");
  const [writeIntent, setWriteIntent] = useState<null | "chunk" | "all" | "next">(null);
  const freshCodeGen = useRef(0);

  const loadList = useCallback(async (options?: { freshCode?: boolean }) => {
    const gen = options?.freshCode ? ++freshCodeGen.current : 0;
    const res = await fetch(options?.freshCode ? "/api/protected/privacy-retention?freshCode=1" : "/api/protected/privacy-retention");
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Laden mislukt");
    if (options?.freshCode && gen !== freshCodeGen.current) {
      return (json.runs ?? []) as RunSummary[];
    }
    setWritesEnabled(Boolean(json.writesEnabled));
    setAppEnv(String(json.appEnv ?? ""));
    setWriteCode(typeof json.writeCode === "string" ? json.writeCode : "");
    setRuns(json.runs ?? []);
    return (json.runs ?? []) as RunSummary[];
  }, []);

  const loadDetail = useCallback(async (runId: number) => {
    const res = await fetch(`/api/protected/privacy-retention?runId=${runId}`);
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Run niet gevonden");
    setDetail({ run: json.run, actions: json.actions ?? [] });
    setSelectedId(runId);
    return json as Detail;
  }, []);

  useEffect(() => {
    if (!isSuperadmin) return;
    void (async () => {
      setLoading(true);
      try {
        const list = await loadList({ freshCode: true });
        if (list[0]) await loadDetail(list[0].id);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      } finally {
        setLoading(false);
      }
    })();
  }, [isSuperadmin, loadList, loadDetail]);

  const post = async (body: Record<string, unknown>) => {
    const res = await fetch("/api/protected/privacy-retention", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(json.error || "Actie mislukt");
    return json;
  };

  const startAndStep = async (mode: "dry-run" | "write", untilDone: boolean) => {
    setBusy(true);
    setError(null);
    let nextCode: string | null = null;
    try {
      const started = await post({ op: "start", mode, confirm });
      let runId = started.run.id as number;
      let status = "running";
      do {
        const stepped = await post({ op: "step", runId });
        if (typeof stepped.writeCode === "string") nextCode = stepped.writeCode;
        setDetail({ run: stepped.run, actions: stepped.actions ?? [] });
        status = stepped.run.status;
        runId = stepped.run.id;
        if (!untilDone) break;
      } while (status === "running" || status === "stepping");
      await loadList();
      if (nextCode) {
        setWriteCode(nextCode);
        setConfirm("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (nextCode) {
        setWriteCode(nextCode);
        setConfirm("");
      }
      await loadList().catch(() => undefined);
    } finally {
      setBusy(false);
    }
  };

  const continueRun = async (runId: number) => {
    setBusy(true);
    setError(null);
    let nextCode: string | null = null;
    try {
      const stepped = await post({ op: "step", runId });
      if (typeof stepped.writeCode === "string") nextCode = stepped.writeCode;
      setDetail({ run: stepped.run, actions: stepped.actions ?? [] });
      await loadList();
      if (nextCode) {
        setWriteCode(nextCode);
        setConfirm("");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      if (nextCode) {
        setWriteCode(nextCode);
        setConfirm("");
      }
    } finally {
      setBusy(false);
    }
  };

  const stopRun = async (runId: number) => {
    setBusy(true);
    setError(null);
    try {
      const stopped = await post({ op: "abort", runId });
      if (stopped.run) setDetail({ run: stopped.run, actions: stopped.actions ?? [] });
      await loadList();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!isSuperadmin) return <FietsberaadSuperadminAccessDenied />;
  if (loading) return <LoadingSpinner />;

  const writeBlocked = appEnv === "production" && !writesEnabled;
  const activeRun = runs.find((run) => run.status === "running" || run.status === "stepping") ?? null;
  const writeUnlocked = writeCode.length > 0 && confirm === writeCode;

  const blockCodeGesture = (event: React.SyntheticEvent) => {
    event.preventDefault();
  };

  return (
    <Box sx={{ p: 3, display: "flex", flexDirection: "column", gap: 2 }}>
      <Typography variant="h4">Retentie & Anonimisering</Typography>
      <Box component="div">
        <Typography>Uitvoeren van een retentie en anonimiseringsslag op de database:</Typography>
        <Box component="ul" sx={{ m: 0, pl: 3 }}>
          <li>De knop simulatie voert de simulatie uit zonder wijzigingen aan de database.</li>
          <li>Type de aangegeven code om de schrijffuncties te ontgrendelen.</li>
        </Box>
      </Box>
      <Box component="div">
        <Typography>Een schrijfrun voert de volgende acties uit:</Typography>
        <Box component="ul" sx={{ m: 0, pl: 3 }}>
          <li>verwijderen van transacties ouder dan 18 maanden</li>
          <li>archiveren van het saldo van oudere betalingen</li>
          <li>leegmaken van het transactionID voor transacties ouder dan 7 jaar</li>
          <li>verwijderen van prijswinnaars ouder dan 10 jaar (fietsenwin)</li>
        </Box>
        <Typography sx={{ mt: 1 }}>
          Eén chunk schrijven verwerkt één beperkte reeks rijen en stopt daarna. Zolang die run open is, staat daar Volgende chunk en Run afbreken.
          Run afbreken stopt de run. Rijen die al verwerkt zijn blijven weg. Schrijven tot klaar start een nieuwe run en herhaalt de reeksen tot alle stappen klaar zijn.
        </Typography>
      </Box>
      {writeBlocked && (
        <Alert severity="warning">
          Schrijven op productie staat uit. Zet PRIVACY_RETENTION_WRITES=1 pas na de simulatie en de test op een kopie.
        </Alert>
      )}
      {error && <Alert severity="error">{error}</Alert>}

      <Box sx={{ display: "flex", gap: 1, flexWrap: "wrap", alignItems: "center" }}>
        <Button variant="outlined" disabled={busy} onClick={() => void startAndStep("dry-run", true)}>
          Simulatie
        </Button>
        <TextField
          size="small"
          value={writeCode}
          aria-label="Code"
          InputProps={{ readOnly: true }}
          inputProps={{
            tabIndex: -1,
            spellCheck: false,
            autoComplete: "off",
            "aria-readonly": true,
            onCopy: blockCodeGesture,
            onCut: blockCodeGesture,
            onPaste: blockCodeGesture,
            onDragStart: blockCodeGesture,
            onContextMenu: blockCodeGesture,
            onMouseDown: blockCodeGesture,
            onSelect: (event: React.SyntheticEvent<HTMLInputElement>) => {
              event.currentTarget.setSelectionRange(0, 0);
            },
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.metaKey || event.ctrlKey) event.preventDefault();
            },
          }}
          sx={{
            width: 108,
            "& input": { fontFamily: "monospace", letterSpacing: "0.12em", userSelect: "none", cursor: "default" },
          }}
        />
        <TextField
          size="small"
          label="herhaal code"
          value={confirm}
          onChange={(event) => setConfirm(event.target.value.toUpperCase().replace(/[^ACEFHJKMNPRTWXY349]/g, "").slice(0, 6))}
          disabled={busy || writeBlocked}
          autoComplete="off"
          inputProps={{ spellCheck: false, autoComplete: "off" }}
          sx={{ width: 160, "& input": { fontFamily: "monospace", letterSpacing: "0.12em" } }}
        />
        {activeRun ? (
          <Button
            variant="contained"
            color="warning"
            disabled={busy || writeBlocked || !writeUnlocked}
            onClick={() => setWriteIntent("next")}
          >
            Volgende chunk
          </Button>
        ) : (
          <Button
            variant="contained"
            color="warning"
            disabled={busy || writeBlocked || !writeUnlocked}
            onClick={() => setWriteIntent("chunk")}
          >
            Eén chunk schrijven
          </Button>
        )}
        {activeRun ? (
          <Button
            variant="contained"
            color="error"
            disabled={busy}
            onClick={() => void stopRun(activeRun.id)}
          >
            Run afbreken
          </Button>
        ) : (
          <Button
            variant="contained"
            color="error"
            disabled={busy || writeBlocked || !writeUnlocked}
            onClick={() => setWriteIntent("all")}
          >
            Schrijven tot klaar
          </Button>
        )}
      </Box>

      <Dialog open={writeIntent !== null} onClose={() => setWriteIntent(null)}>
        <DialogTitle>Data permanent verwijderen</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Door het uitvoeren van deze actie verwijdert u data permanent uit de database. Dit kan niet ongedaan worden gemaakt. Wilt u doorgaan?
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => {
            const intent = writeIntent;
            const runId = activeRun?.id;
            setWriteIntent(null);
            if (intent === "next" && runId) {
              void continueRun(runId);
              return;
            }
            void startAndStep("write", intent === "all");
          }} color="error">
            Doorgaan
          </Button>
          <Button variant="contained" autoFocus onClick={() => setWriteIntent(null)}>
            Afbreken
          </Button>
        </DialogActions>
      </Dialog>

      <Typography variant="h6">Vorige runs</Typography>
      <Table size="small">
        <TableHead>
          <TableRow>
            <TableCell>Id</TableCell>
            <TableCell>Modus</TableCell>
            <TableCell>Status</TableCell>
            <TableCell>Door</TableCell>
            <TableCell>Start</TableCell>
            <TableCell>Einde</TableCell>
          </TableRow>
        </TableHead>
        <TableBody>
          {runs.map((run) => (
            <TableRow
              key={run.id}
              hover
              selected={run.id === selectedId}
              onClick={() => void loadDetail(run.id).catch((e) => setError(e instanceof Error ? e.message : String(e)))}
              sx={{ cursor: "pointer" }}
            >
              <TableCell>{run.id}</TableCell>
              <TableCell>{run.mode === "write" ? "schrijven" : "Simulatie"}</TableCell>
              <TableCell>{run.status}</TableCell>
              <TableCell>{run.startedBy}</TableCell>
              <TableCell>{formatWhen(run.startedAt)}</TableCell>
              <TableCell>{formatWhen(run.finishedAt)}</TableCell>
            </TableRow>
          ))}
          {runs.length === 0 && (
            <TableRow>
              <TableCell colSpan={6}>Nog geen runs.</TableCell>
            </TableRow>
          )}
        </TableBody>
      </Table>

      {detail && (
        <Paper sx={{ p: 2 }} variant="outlined">
          <Typography variant="h6">
            Run {detail.run.id} — {detail.run.status}
            {detail.run.currentAction ? ` — ${detail.run.currentAction}` : ""}
          </Typography>
          {detail.run.errorText && <Alert severity="error" sx={{ my: 1 }}>{detail.run.errorText}</Alert>}
          <Table size="small" sx={{ my: 1 }}>
            <TableHead>
              <TableRow>
                <TableCell>Actie</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Kandidaten</TableCell>
                <TableCell align="right">Gewijzigd</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {detail.actions.map((action) => (
                <TableRow key={action.id}>
                  <TableCell>{action.heading}</TableCell>
                  <TableCell>{action.status}</TableCell>
                  <TableCell align="right">{action.rowsMatched}</TableCell>
                  <TableCell align="right">{action.rowsChanged}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          <Typography variant="subtitle2">Log</Typography>
          <Box
            component="pre"
            sx={{
              m: 0,
              p: 1.5,
              maxHeight: 360,
              overflow: "auto",
              bgcolor: "grey.100",
              fontSize: 13,
              whiteSpace: "pre-wrap",
            }}
          >
            {detail.run.logText || "—"}
          </Box>
        </Paper>
      )}
    </Box>
  );
};

export default PrivacyBeheerComponent;
