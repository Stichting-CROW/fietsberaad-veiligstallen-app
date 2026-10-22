import React, { useCallback, useEffect, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  FormControlLabel,
  Paper,
  TextField,
  Typography,
} from "@mui/material";
import Link from "next/link";

type Owner = { id: string; name: string | null; gemeenteCode: number | null; zipId: string | null };
type Named = { id: string; name: string | null };
type Stalling = { id: string; stallingsId: string | null; title: string | null; siteId: string | null; exploitantId: string | null };
type Catalog = { prodAvailable: boolean; owners: Owner[]; exploitants: Named[]; stallingen: Stalling[] };
type Job = {
  status: "running" | "done" | "error";
  step: string;
  error?: string;
  counts: Record<string, number>;
  warnings: { table: string; message: string }[];
  logins: { username: string; password: string }[];
  libraryFiles: number;
};

const defaultFrom = () => {
  const date = new Date();
  date.setMonth(date.getMonth() - 1);
  return date.toISOString().slice(0, 10);
};

export default function TestOmgeving() {
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [ownerIds, setOwnerIds] = useState<string[]>([]);
  const [exploitantIds, setExploitantIds] = useState<string[]>([]);
  const [stallingIds, setStallingIds] = useState<string[]>([]);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [job, setJob] = useState<Job | null>(null);

  const loadCatalog = useCallback(async (nextOwners = ownerIds, nextExploitants = exploitantIds) => {
    const params = new URLSearchParams();
    if (nextOwners.length > 0) params.set("ownerIds", nextOwners.join(","));
    if (nextExploitants.length > 0) params.set("exploitantIds", nextExploitants.join(","));
    const response = await fetch(`/api/protected/test-env/catalog?${params.toString()}`);
    const body = await response.json() as Catalog & { error?: string };
    if (!response.ok) throw new Error(body.error || "Catalogus laden mislukt");
    setCatalog(body);
  }, [ownerIds, exploitantIds]);

  useEffect(() => {
    loadCatalog([], []).catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : String(loadError));
    });
    // Load the owner list once. Later selections call loadCatalog themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (current: string[], id: string, set: (ids: string[]) => void) => {
    set(current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const createTeststalling = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const loginResponse = await fetch("/api/protected/test-env/teststalling", { method: "POST" });
      const loginBody = await loginResponse.json() as { error?: string; login?: { username: string; password: string } };
      if (!loginResponse.ok) throw new Error(loginBody.error || "Beheerlogin mislukt");
      const createResponse = await fetch("/api/protected/parking-simulation/test-gemeente/create", { method: "POST" });
      const createBody = await createResponse.json() as { error?: string; id?: string };
      if (!createResponse.ok && createResponse.status !== 400) {
        throw new Error(createBody.error || "Testgemeente aanmaken mislukt");
      }
      const login = loginBody.login;
      setInfo(
        `Beheerlogin ${login?.username} / ${login?.password}. ${createBody.error ? createBody.error : `Testgemeente ${createBody.id ?? ""} aangemaakt.`}`,
      );
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
    } finally {
      setBusy(false);
    }
  };

  const startSnapshot = async () => {
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/protected/test-env/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerIds,
          exploitantIds,
          stallingIds,
          from: new Date(`${from}T00:00:00`).toISOString(),
          to: new Date(`${to}T23:59:59`).toISOString(),
          confirm,
        }),
      });
      const body = await response.json() as { error?: string; job?: Job };
      if (!response.ok && response.status !== 202) throw new Error(body.error || "Snapshot starten mislukt");
      setJob(body.job ?? null);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
      setBusy(false);
    }
  };

  useEffect(() => {
    if (job?.status !== "running") return;
    const timer = setInterval(() => {
      fetch("/api/protected/test-env/status")
        .then((response) => response.json())
        .then((body: { job?: Job | null }) => {
          if (!body.job) return;
          setJob(body.job);
          if (body.job.status !== "running") setBusy(false);
        })
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [job?.status]);

  return (
    <Box sx={{ p: 2, display: "grid", gap: 2, maxWidth: 960 }}>
      <Typography variant="h5">Acceptatie (docker)</Typography>
      <Typography variant="body2">
        Vult de database van deze teststack. Productiegegevens worden alleen gelezen als <code>PROD_DATABASE_URL</code> op deze machine staat.
      </Typography>
      {error && <Alert severity="error">{error}</Alert>}
      {info && <Alert severity="success">{info}</Alert>}

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6">Teststalling</Typography>
        <Typography variant="body2" sx={{ mb: 1 }}>
          Maakt de beheerlogin en de testgemeente API (9933). Daarna kun je in de parkeersimulatie een stalling klonen.
        </Typography>
        <Button variant="contained" disabled={busy} onClick={() => void createTeststalling()}>
          Teststalling aanmaken
        </Button>
        <Button component={Link} href="/beheer/parking-simulation" sx={{ ml: 1 }}>
          Parkeersimulatie
        </Button>
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h6">Productiesnapshot</Typography>
        {!catalog?.prodAvailable && (
          <Alert severity="info" sx={{ my: 1 }}>Productiekopie is niet beschikbaar op deze server.</Alert>
        )}
        {catalog?.prodAvailable && (
          <Box sx={{ display: "grid", gap: 1 }}>
            <Typography variant="subtitle2">Data-eigenaren</Typography>
            <Box sx={{ maxHeight: 220, overflow: "auto" }}>
              {catalog.owners.map((owner) => (
                <FormControlLabel
                  key={owner.id}
                  control={<Checkbox size="small" checked={ownerIds.includes(owner.id)} onChange={() => {
                    const next = ownerIds.includes(owner.id) ? ownerIds.filter((id) => id !== owner.id) : [...ownerIds, owner.id];
                    setOwnerIds(next);
                    setExploitantIds([]);
                    setStallingIds([]);
                    loadCatalog(next, []).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : String(loadError)));
                  }} />}
                  label={owner.name || owner.id}
                />
              ))}
            </Box>
            <Typography variant="subtitle2">Exploitanten</Typography>
            <Box sx={{ maxHeight: 160, overflow: "auto" }}>
              {catalog.exploitants.map((exploitant) => (
                <FormControlLabel
                  key={exploitant.id}
                  control={<Checkbox size="small" checked={exploitantIds.includes(exploitant.id)} onChange={() => {
                    const next = exploitantIds.includes(exploitant.id) ? exploitantIds.filter((id) => id !== exploitant.id) : [...exploitantIds, exploitant.id];
                    setExploitantIds(next);
                    loadCatalog(ownerIds, next).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : String(loadError)));
                  }} />}
                  label={exploitant.name || exploitant.id}
                />
              ))}
            </Box>
            <Typography variant="subtitle2">Stallingen</Typography>
            <Box sx={{ maxHeight: 220, overflow: "auto" }}>
              {catalog.stallingen.map((stalling) => (
                <FormControlLabel
                  key={stalling.id}
                  control={<Checkbox size="small" checked={stallingIds.includes(stalling.id)} onChange={() => toggle(stallingIds, stalling.id, setStallingIds)} />}
                  label={`${stalling.title || stalling.stallingsId || stalling.id}`}
                />
              ))}
            </Box>
            <Box sx={{ display: "flex", gap: 2 }}>
              <TextField label="Van" type="date" value={from} onChange={(event) => setFrom(event.target.value)} InputLabelProps={{ shrink: true }} />
              <TextField label="Tot" type="date" value={to} onChange={(event) => setTo(event.target.value)} InputLabelProps={{ shrink: true }} />
              <TextField label="Typ WISSEN" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
            </Box>
            <Button variant="contained" color="warning" disabled={busy || confirm !== "WISSEN" || stallingIds.length === 0} onClick={() => void startSnapshot()}>
              Snapshot laden
            </Button>
          </Box>
        )}
        {job && (
          <Box sx={{ mt: 2 }}>
            <Typography variant="body2">Status: {job.status} — {job.step}</Typography>
            {job.error && <Alert severity="error" sx={{ mt: 1 }}>{job.error}</Alert>}
            {job.logins.length > 0 && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                Inloggen: {job.logins.map((login) => `${login.username} / ${login.password}`).join(", ")}
              </Typography>
            )}
            {job.status === "done" && (
              <Typography variant="body2">Bibliotheekbestanden: {job.libraryFiles}. Kopieer <code>docker/acceptance/library</code> naar de VPS als de database daar draait.</Typography>
            )}
            {job.warnings.slice(0, 8).map((warning, index) => (
              <Typography key={`${warning.table}-${index}`} variant="caption" display="block">{warning.table}: {warning.message}</Typography>
            ))}
          </Box>
        )}
      </Paper>
    </Box>
  );
}
