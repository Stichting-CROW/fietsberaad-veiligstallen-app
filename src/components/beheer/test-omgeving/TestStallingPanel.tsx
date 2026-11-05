import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  MenuItem,
  TextField,
  Typography,
} from "@mui/material";
import { FiTrash2 } from "react-icons/fi";
import { useFietsenstallingenCompact } from "~/hooks/useFietsenstallingenCompact";
import { useFietsenstallingtypen } from "~/hooks/useFietsenstallingtypen";

type TestStalling = { id: string; locationid: string; title: string; type: string };

function formatStallingLabel(title: string, locationid: string): string {
  if (locationid && title) return `${title} (${locationid})`;
  return locationid || title || "—";
}

type Props = {
  refreshKey?: number;
  onMessage?: (message: string, isError?: boolean) => void;
};

export default function TestStallingPanel({ refreshKey = 0, onMessage }: Props) {
  const [testGemeenteStatus, setTestGemeenteStatus] = useState<{ exists: boolean; id: string | null } | null>(null);
  const [testStallings, setTestStallings] = useState<TestStalling[]>([]);
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [cloneType, setCloneType] = useState("");
  const [cloneSiteId, setCloneSiteId] = useState("");
  const [cloneSourceOwners, setCloneSourceOwners] = useState<
    Array<{ id: string; companyName: string; stallingCount: number }>
  >([]);
  const [cloneSourceOwnersLoading, setCloneSourceOwnersLoading] = useState(false);
  const [cloneStallingSearch, setCloneStallingSearch] = useState("");
  const [selectedSourceId, setSelectedSourceId] = useState("");
  const [cloneTitle, setCloneTitle] = useState("");
  const [cloneLoading, setCloneLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState<string | null>(null);

  const { fietsenstallingtypen } = useFietsenstallingtypen();
  const { fietsenstallingen, isLoading: cloneStallingsLoading } = useFietsenstallingenCompact(cloneSiteId || undefined);

  const cloneStallings = useMemo(() => {
    if (!cloneType || !cloneSiteId) return [];
    let filtered = fietsenstallingen.filter((f) => f.Type === cloneType);
    if (cloneStallingSearch.trim()) {
      const q = cloneStallingSearch.trim().toLowerCase();
      filtered = filtered.filter((f) => (f.Title ?? "").toLowerCase().includes(q));
    }
    return filtered.map((f) => ({
      id: f.ID,
      locationid: f.StallingsID ?? "",
      title: f.Title ?? "",
      type: f.Type ?? "",
    }));
  }, [fietsenstallingen, cloneType, cloneSiteId, cloneStallingSearch]);

  const fetchTestGemeenteStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/protected/test-env/test-gemeente/status");
      if (res.ok) {
        const data = await res.json() as { exists?: boolean; id?: string | null };
        setTestGemeenteStatus({ exists: !!data.exists, id: data.id ?? null });
      }
    } catch {
      setTestGemeenteStatus(null);
    }
  }, []);

  const fetchTestStallings = useCallback(async () => {
    if (!testGemeenteStatus?.exists || !testGemeenteStatus.id) {
      setTestStallings([]);
      return;
    }
    try {
      const res = await fetch(`/api/protected/fietsenstallingen?GemeenteID=${testGemeenteStatus.id}`);
      const json = (await (res.ok ? res.json() : { data: [] })) as {
        data?: Array<{ ID: string; StallingsID: string; Title: string | null; Type: string | null }>;
      };
      setTestStallings(
        (json.data ?? []).map((s) => ({
          id: s.ID,
          locationid: s.StallingsID,
          title: s.Title ?? "",
          type: s.Type ?? "",
        })),
      );
    } catch {
      setTestStallings([]);
    }
  }, [testGemeenteStatus?.exists, testGemeenteStatus?.id]);

  useEffect(() => {
    void fetchTestGemeenteStatus();
  }, [fetchTestGemeenteStatus, refreshKey]);

  useEffect(() => {
    void fetchTestStallings();
  }, [fetchTestStallings, refreshKey]);

  useEffect(() => {
    if (!cloneType) {
      setCloneSourceOwners([]);
      setCloneSiteId("");
      return;
    }
    setCloneSiteId("");
    setSelectedSourceId("");
    setCloneSourceOwnersLoading(true);
    fetch(`/api/protected/test-env/clone-stalling?type=${encodeURIComponent(cloneType)}`)
      .then((r) => r.json())
      .then((d: { owners?: Array<{ id: string; companyName: string; stallingCount: number }> }) => {
        setCloneSourceOwners(d.owners ?? []);
      })
      .catch(() => setCloneSourceOwners([]))
      .finally(() => setCloneSourceOwnersLoading(false));
  }, [cloneType]);

  useEffect(() => {
    if (!cloneType || !cloneSiteId) setSelectedSourceId("");
  }, [cloneType, cloneSiteId]);

  useEffect(() => {
    if (selectedSourceId && fietsenstallingtypen.length > 0) {
      const src = cloneStallings.find((s) => s.id === selectedSourceId);
      const typeName = fietsenstallingtypen.find((t) => t.id === (src?.type ?? cloneType))?.name ?? cloneType;
      const existingTitles = testStallings.filter((s) => s.type === (src?.type ?? cloneType)).map((s) => s.title);
      let n = 1;
      let defaultTitle = `API ${typeName} #${n}`;
      while (existingTitles.includes(defaultTitle)) {
        n++;
        defaultTitle = `API ${typeName} #${n}`;
      }
      setCloneTitle(defaultTitle);
    }
  }, [selectedSourceId, cloneStallings, fietsenstallingtypen, cloneType, testStallings]);

  const handleCloneStalling = async () => {
    if (!selectedSourceId || !cloneTitle.trim()) return;
    setCloneLoading(true);
    try {
      const res = await fetch("/api/protected/test-env/clone-stalling", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceStallingId: selectedSourceId, title: cloneTitle.trim() }),
      });
      const data = await res.json() as { message?: string };
      if (!res.ok) throw new Error(data.message ?? res.statusText);
      onMessage?.("Stalling gekloond.");
      setAddDialogOpen(false);
      setSelectedSourceId("");
      setCloneTitle("");
      await fetchTestStallings();
    } catch (e) {
      onMessage?.(`Fout: ${e instanceof Error ? e.message : String(e)}`, true);
    } finally {
      setCloneLoading(false);
    }
  };

  const handleDeleteStalling = async (id: string) => {
    setDeleteLoading(id);
    try {
      const res = await fetch(`/api/protected/fietsenstallingen/${id}`, { method: "DELETE" });
      const data = (await res.json()) as { message?: string; error?: string };
      if (!res.ok) throw new Error(data.message ?? data.error ?? res.statusText);
      onMessage?.("Stalling verwijderd.");
      await fetchTestStallings();
    } catch (e) {
      onMessage?.(`Fout: ${e instanceof Error ? e.message : String(e)}`, true);
    } finally {
      setDeleteLoading(null);
    }
  };

  if (testGemeenteStatus && !testGemeenteStatus.exists) {
    return (
      <Alert severity="info" sx={{ mt: 2 }}>
        Maak eerst de test data-eigenaar aan met de knop hierboven. Daarna kun je extra stallings klonen.
      </Alert>
    );
  }

  return (
    <Box sx={{ mt: 3 }}>
      <Box sx={{ display: "flex", alignItems: "center", gap: 2, mb: 1 }}>
        <Typography variant="subtitle1">Teststallingen (9933)</Typography>
        <Button
          variant="outlined"
          size="small"
          onClick={() => {
            setAddDialogOpen(true);
            setCloneType("");
            setCloneSiteId("");
            setCloneStallingSearch("");
            setSelectedSourceId("");
            setCloneTitle("");
          }}
        >
          Stalling klonen
        </Button>
      </Box>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Kloon layout van een bestaande stalling naar de testgemeente. Geen transactiedata.
      </Typography>
      <Box component="table" sx={{ width: "100%", borderCollapse: "collapse", fontSize: "0.875rem" }}>
        <Box component="thead">
          <Box component="tr" sx={{ bgcolor: "action.hover" }}>
            <Box component="th" sx={{ textAlign: "left", p: 1 }}>Titel</Box>
            <Box component="th" sx={{ textAlign: "left", p: 1 }}>StallingsID</Box>
            <Box component="th" sx={{ textAlign: "left", p: 1 }}>Type</Box>
            <Box component="th" sx={{ textAlign: "right", p: 1, width: 48 }} />
          </Box>
        </Box>
        <Box component="tbody">
          {testStallings.map((s) => (
            <Box component="tr" key={s.id} sx={{ borderBottom: 1, borderColor: "divider" }}>
              <Box component="td" sx={{ p: 1 }}>{s.title}</Box>
              <Box component="td" sx={{ p: 1, fontFamily: "monospace", fontSize: "0.75rem" }}>{s.locationid || "—"}</Box>
              <Box component="td" sx={{ p: 1 }}>{s.type || "—"}</Box>
              <Box component="td" sx={{ p: 1, textAlign: "right" }}>
                <button
                  type="button"
                  aria-label="Verwijderen"
                  disabled={deleteLoading === s.id}
                  onClick={() => void handleDeleteStalling(s.id)}
                  style={{
                    border: "none",
                    background: "transparent",
                    cursor: deleteLoading === s.id ? "default" : "pointer",
                    opacity: deleteLoading === s.id ? 0.5 : 1,
                    padding: 4,
                  }}
                >
                  <FiTrash2 size={16} />
                </button>
              </Box>
            </Box>
          ))}
          {testStallings.length === 0 && testGemeenteStatus?.exists && (
            <Box component="tr">
              <Box component="td" colSpan={4} sx={{ p: 2, color: "text.secondary" }}>
                Geen stallings in de testgemeente.
              </Box>
            </Box>
          )}
        </Box>
      </Box>

      <Dialog open={addDialogOpen} onClose={() => setAddDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Stalling klonen naar testgemeente</DialogTitle>
        <DialogContent sx={{ display: "flex", flexDirection: "column", gap: 2, pt: 1 }}>
          <TextField
            select
            label="Type"
            value={cloneType}
            onChange={(e) => setCloneType(e.target.value)}
            fullWidth
            size="small"
          >
            <MenuItem value="">—</MenuItem>
            {fietsenstallingtypen.map((t) => (
              <MenuItem key={t.id} value={t.id}>{t.name ?? t.id}</MenuItem>
            ))}
          </TextField>
          <TextField
            select
            label="Bron (data-eigenaar)"
            value={cloneSiteId}
            onChange={(e) => setCloneSiteId(e.target.value)}
            fullWidth
            size="small"
            disabled={!cloneType || cloneSourceOwnersLoading}
            helperText="Organisatie waar de te klonen stalling staat."
          >
            <MenuItem value="">
              {cloneSourceOwnersLoading
                ? "Laden…"
                : !cloneType
                  ? "Kies eerst een type"
                  : cloneSourceOwners.length === 0
                    ? "Geen bronnen voor dit type"
                    : "—"}
            </MenuItem>
            {cloneSourceOwners.map((c) => (
              <MenuItem key={c.id} value={c.id}>
                {c.companyName} ({c.stallingCount})
              </MenuItem>
            ))}
          </TextField>
          {cloneType && cloneSiteId && (
            <>
              <TextField
                label="Zoeken"
                value={cloneStallingSearch}
                onChange={(e) => setCloneStallingSearch(e.target.value)}
                fullWidth
                size="small"
              />
              <TextField
                select
                label="Bronstalling"
                value={selectedSourceId}
                onChange={(e) => setSelectedSourceId(e.target.value)}
                fullWidth
                size="small"
                disabled={cloneStallingsLoading}
              >
                <MenuItem value="">{cloneStallingsLoading ? "Laden…" : "—"}</MenuItem>
                {cloneStallings.map((s) => (
                  <MenuItem key={s.id} value={s.id}>
                    {formatStallingLabel(s.title, s.locationid)}
                  </MenuItem>
                ))}
              </TextField>
            </>
          )}
          {selectedSourceId && (
            <TextField
              label="Titel in testgemeente"
              value={cloneTitle}
              onChange={(e) => setCloneTitle(e.target.value)}
              fullWidth
              size="small"
            />
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setAddDialogOpen(false)}>Annuleren</Button>
          <Button
            variant="contained"
            onClick={() => void handleCloneStalling()}
            disabled={cloneLoading || !selectedSourceId || !cloneTitle.trim()}
          >
            Aanmaken
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
