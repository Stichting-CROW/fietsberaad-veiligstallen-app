import React, { useCallback, useEffect, useState } from "react";
import { Box, Button, Tab, Tabs, TextField, Typography, MenuItem, Switch, FormControlLabel } from "@mui/material";
import { LoadingSpinner } from "../common/LoadingSpinner";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { useSession } from "next-auth/react";
import { buildDisplayUrls } from "~/utils/display-urls";

type Slide = {
  ID: string;
  Title: string | null;
  ContentType: string | null;
  Article: string | null;
  RSS: string | null;
  Duration: number | null;
  Status: string | null;
  SortOrder: number | null;
};

type Ticker = { ID: string; Item: string | null; SortOrder: number | null };

const CONTENT_TYPES = ["Article", "RSS", "Bikepark", "Openingstijden", "Verwijssysteem", "Verwijssysteem_stallingen"];

const PresentationsComponent: React.FC = () => {
  const { data: session } = useSession();
  const canEdit = userHasRight(session?.user?.securityProfile, VSSecurityTopic.diashow_beheer);
  const [tab, setTab] = useState(0);
  const [slides, setSlides] = useState<Slide[]>([]);
  const [ticker, setTicker] = useState<Ticker[]>([]);
  const [loading, setLoading] = useState(true);
  const [editId, setEditId] = useState<string | null>(null);
  const [showSlideForm, setShowSlideForm] = useState(false);
  const [form, setForm] = useState<Partial<Slide>>({ ContentType: "Article", Duration: 10, Status: "1" });
  const [tickerItem, setTickerItem] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    const [s, t] = await Promise.all([
      fetch("/api/protected/presentations").then((r) => r.json()),
      fetch("/api/protected/presentations-ticker").then((r) => r.json()),
    ]);
    setSlides(s.data ?? []);
    setTicker(t.data ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (!canEdit) {
    return <Typography>Geen rechten voor Diashow.</Typography>;
  }

  if (loading) return <LoadingSpinner />;

  const saveSlide = async () => {
    if (editId) {
      await fetch(`/api/protected/presentations/${editId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    } else {
      await fetch("/api/protected/presentations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
    }
    setEditId(null);
    setShowSlideForm(false);
    setForm({ ContentType: "Article", Duration: 10, Status: "1" });
    await load();
  };

  const addTicker = async () => {
    if (!tickerItem.trim()) return;
    await fetch("/api/protected/presentations-ticker", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ Item: tickerItem }),
    });
    setTickerItem("");
    await load();
  };

  const siteId = session?.user?.activeContactId;
  const previewUrl = siteId
    ? buildDisplayUrls({ kind: "presentaties-frame", siteId, urlName: "preview" }).previewUrl
    : "#";

  return (
    <Box sx={{ p: 2 }}>
      <Typography variant="h5" gutterBottom>
        Diashow
      </Typography>
      <Button href={previewUrl} target="_blank" rel="noreferrer" sx={{ mb: 2 }}>
        Preview presentatie
      </Button>
      <Tabs value={tab} onChange={(_, v) => setTab(v)}>
        <Tab label="Dia's" />
        <Tab label="Lichtkrant" />
      </Tabs>

      {tab === 0 && (
        <Box sx={{ mt: 2 }}>
          <Button
            variant="contained"
            sx={{ mb: 2 }}
            onClick={() => {
              setEditId(null);
              setShowSlideForm(true);
              setForm({ ContentType: "Article", Duration: 10, Status: "1", Title: "", Article: "" });
            }}
          >
            Nieuwe dia
          </Button>
          {slides.map((s) => (
            <Box key={s.ID} sx={{ borderBottom: "1px solid #ccc", py: 1, display: "flex", gap: 2, alignItems: "center" }}>
              <Typography sx={{ flex: 1 }}>
                {s.SortOrder}. {s.Title} ({s.ContentType}) {s.Status === "1" ? "" : "[uit]"}
              </Typography>
              <Button size="small" onClick={() => { setEditId(s.ID); setShowSlideForm(true); setForm(s); }}>Bewerken</Button>
              <Button
                size="small"
                color="error"
                onClick={async () => {
                  if (!confirm("Verwijderen?")) return;
                  await fetch(`/api/protected/presentations/${s.ID}`, { method: "DELETE" });
                  await load();
                }}
              >
                Verwijder
              </Button>
            </Box>
          ))}
          {showSlideForm && (
            <Box sx={{ mt: 3, display: "grid", gap: 2, maxWidth: 720 }}>
              <TextField label="Titel" value={form.Title ?? ""} onChange={(e) => setForm({ ...form, Title: e.target.value })} />
              <TextField
                select
                label="Type"
                value={form.ContentType ?? "Article"}
                onChange={(e) => setForm({ ...form, ContentType: e.target.value })}
              >
                {CONTENT_TYPES.map((t) => (
                  <MenuItem key={t} value={t}>{t}</MenuItem>
                ))}
              </TextField>
              {(form.ContentType === "Article" || !form.ContentType) && (
                <TextField
                  multiline
                  minRows={6}
                  label="Tekst (HTML)"
                  value={form.Article ?? ""}
                  onChange={(e) => setForm({ ...form, Article: e.target.value })}
                  helperText="Placeholders: {aantal_gestalde_fietsen_lopend_jaar}, {blokken_aantal_gestalde_fietsen_lopend_jaar}"
                />
              )}
              {form.ContentType === "RSS" && (
                <TextField label="RSS URL" value={form.RSS ?? ""} onChange={(e) => setForm({ ...form, RSS: e.target.value })} />
              )}
              <TextField
                type="number"
                label="Duur (seconden)"
                value={form.Duration ?? 10}
                onChange={(e) => setForm({ ...form, Duration: Number(e.target.value) })}
              />
              <FormControlLabel
                control={
                  <Switch
                    checked={form.Status !== "0"}
                    onChange={(e) => setForm({ ...form, Status: e.target.checked ? "1" : "0" })}
                  />
                }
                label="Toon deze pagina"
              />
              <Box sx={{ display: "flex", gap: 1 }}>
                <Button variant="contained" onClick={() => void saveSlide()}>Opslaan</Button>
                <Button onClick={() => { setEditId(null); setShowSlideForm(false); setForm({ ContentType: "Article", Duration: 10, Status: "1" }); }}>Annuleren</Button>
              </Box>
            </Box>
          )}
        </Box>
      )}

      {tab === 1 && (
        <Box sx={{ mt: 2 }}>
          <Box sx={{ display: "flex", gap: 1, mb: 2 }}>
            <TextField label="Nieuwe lichtkrant regel" value={tickerItem} onChange={(e) => setTickerItem(e.target.value)} fullWidth />
            <Button variant="contained" onClick={() => void addTicker()}>Toevoegen</Button>
          </Box>
          {ticker.map((t) => (
            <Box key={t.ID} sx={{ display: "flex", gap: 1, alignItems: "center", py: 1 }}>
              <Typography sx={{ flex: 1 }}>{t.SortOrder}. {t.Item}</Typography>
              <Button
                size="small"
                color="error"
                onClick={async () => {
                  await fetch(`/api/protected/presentations-ticker/${t.ID}`, { method: "DELETE" });
                  await load();
                }}
              >
                Verwijder
              </Button>
            </Box>
          ))}
        </Box>
      )}
    </Box>
  );
};

export default PresentationsComponent;
