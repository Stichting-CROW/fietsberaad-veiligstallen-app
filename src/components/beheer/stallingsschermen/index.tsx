import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Box,
  Tab,
  Tabs,
  TextField,
  MenuItem,
  Typography,
  IconButton,
  InputAdornment,
} from "@mui/material";
import { FiCopy, FiRefreshCw } from "react-icons/fi";
import { useSession } from "next-auth/react";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { LoadingSpinner } from "../common/LoadingSpinner";
import FietsberaadSuperadminAccessDenied from "../common/FietsberaadSuperadminAccessDenied";
import {
  buildDisplayUrls,
  type OverzichtenPage,
  type StallingsschermKind,
} from "~/utils/display-urls";

type Gemeente = { id: string; companyName: string; urlName: string };
type Stalling = { id: string; title: string; stallingsID: string | null };

type MainTab = StallingsschermKind;

const MAIN_TABS: { id: MainTab; label: string; needsStalling?: boolean }[] = [
  { id: "presentaties-frame", label: "Presentaties (frame)" },
  { id: "presentaties-slide", label: "Presentaties (dia's)" },
  { id: "verwijssysteem-gemeente", label: "Verwijssysteem (gemeente)" },
  { id: "verwijssysteem-stalling", label: "Verwijssysteem (stalling)", needsStalling: true },
  { id: "overzichten", label: "Overzichten" },
];

const OVERZICHT_PAGES: { value: OverzichtenPage; label: string }[] = [
  { value: "VrijePlekken", label: "Vrije plekken" },
  { value: "BezettePlekken", label: "Bezette plekken" },
  { value: "Langstallers", label: "Langstallers" },
  { value: "Saldotekort", label: "Saldotekort" },
  { value: "Pas", label: "Pas" },
  { value: "Stallingen", label: "Stallingen" },
];

const StallingsschermenComponent: React.FC = () => {
  const { data: session } = useSession();
  const isSuperadmin = userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin);

  const [gemeenten, setGemeenten] = useState<Gemeente[]>([]);
  const [stallingen, setStallingen] = useState<Stalling[]>([]);
  const [siteId, setSiteId] = useState("");
  const [stallingId, setStallingId] = useState("");
  const [mainTab, setMainTab] = useState<MainTab>("presentaties-frame");
  const [overzichtPage, setOverzichtPage] = useState<OverzichtenPage>("VrijePlekken");
  const [loading, setLoading] = useState(true);
  const [iframeKey, setIframeKey] = useState(0);
  const [appOrigin, setAppOrigin] = useState("");

  const isDev = process.env.NODE_ENV === "development";

  useEffect(() => {
    if (typeof window !== "undefined") setAppOrigin(window.location.origin);
  }, []);

  const loadGemeenten = useCallback(async () => {
    const res = await fetch("/api/protected/stallingsschermen");
    const json = await res.json();
    setGemeenten(json.data ?? []);
  }, []);

  useEffect(() => {
    if (!isSuperadmin) return;
    void (async () => {
      setLoading(true);
      await loadGemeenten();
      setLoading(false);
    })();
  }, [isSuperadmin, loadGemeenten]);

  useEffect(() => {
    if (!siteId) {
      setStallingen([]);
      setStallingId("");
      return;
    }
    void fetch(`/api/protected/stallingsschermen?siteId=${encodeURIComponent(siteId)}`)
      .then((r) => r.json())
      .then((json) => setStallingen(json.data ?? []))
      .catch(() => setStallingen([]));
    setStallingId("");
  }, [siteId]);

  const selectedGemeente = gemeenten.find((g) => g.id === siteId);
  const selectedStalling = stallingen.find((s) => s.id === stallingId) ?? null;

  const urls = useMemo(() => {
    if (!selectedGemeente?.urlName) {
      return { previewUrl: "", productionUrl: "" };
    }
    return buildDisplayUrls({
      kind: mainTab,
      siteId: selectedGemeente.id,
      urlName: selectedGemeente.urlName,
      stalling: selectedStalling
        ? {
            id: selectedStalling.id,
            stallingsID: selectedStalling.stallingsID,
            title: selectedStalling.title,
          }
        : null,
      overzichtPage: mainTab === "overzichten" ? overzichtPage : undefined,
    });
  }, [mainTab, overzichtPage, selectedGemeente, selectedStalling]);

  const tabNeedsStalling = MAIN_TABS.find((t) => t.id === mainTab)?.needsStalling;
  const previewReady =
    selectedGemeente?.urlName &&
    (!tabNeedsStalling || selectedStalling?.stallingsID);

  const devUrl = urls.previewUrl && appOrigin ? `${appOrigin}${urls.previewUrl}` : urls.previewUrl;

  const copyProduction = async () => {
    if (!urls.productionUrl) return;
    await navigator.clipboard.writeText(urls.productionUrl);
  };

  const copyDev = async () => {
    if (!devUrl) return;
    await navigator.clipboard.writeText(devUrl);
  };

  if (!isSuperadmin) {
    return <FietsberaadSuperadminAccessDenied />;
  }

  if (loading) return <LoadingSpinner />;

  return (
    <Box sx={{ p: 2, maxWidth: 1400 }}>
      <Typography variant="h5" gutterBottom>
        Stallingsschermen
      </Typography>
      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Preview van externe displays. Het productielink is wat je op het fysieke scherm configureert.
      </Typography>

      <Box sx={{ display: "flex", flexWrap: "wrap", gap: 2, mb: 2 }}>
        <TextField
          select
          label="Gemeente"
          value={siteId}
          onChange={(e) => setSiteId(e.target.value)}
          sx={{ minWidth: 280 }}
        >
          <MenuItem value="">— kies —</MenuItem>
          {gemeenten.map((g) => (
            <MenuItem key={g.id} value={g.id}>
              {g.companyName}
              {!g.urlName ? " (geen UrlName)" : ""}
            </MenuItem>
          ))}
        </TextField>

        <TextField
          select
          label="Stalling (optioneel)"
          value={stallingId}
          onChange={(e) => setStallingId(e.target.value)}
          disabled={!siteId}
          sx={{ minWidth: 280 }}
        >
          <MenuItem value="">— geen / gemeenteniveau —</MenuItem>
          {stallingen.map((s) => (
            <MenuItem key={s.id} value={s.id}>
              {s.title}
              {s.stallingsID ? ` (${s.stallingsID})` : ""}
            </MenuItem>
          ))}
        </TextField>

        {mainTab === "overzichten" && (
          <TextField
            select
            label="Overzicht"
            value={overzichtPage}
            onChange={(e) => setOverzichtPage(e.target.value as OverzichtenPage)}
            sx={{ minWidth: 200 }}
          >
            {OVERZICHT_PAGES.map((p) => (
              <MenuItem key={p.value} value={p.value}>
                {p.label}
              </MenuItem>
            ))}
          </TextField>
        )}
      </Box>

      <TextField
        label="Link voor het scherm (productie)"
        value={urls.productionUrl}
        fullWidth
        InputProps={{
          readOnly: true,
          endAdornment: (
            <InputAdornment position="end">
              <IconButton onClick={() => void copyProduction()} disabled={!urls.productionUrl} aria-label="Kopiëren">
                <FiCopy />
              </IconButton>
            </InputAdornment>
          ),
        }}
        sx={{ mb: 2 }}
      />

      {isDev && urls.previewUrl ? (
        <TextField
          label="Link lokaal testen (dev)"
          value={devUrl}
          fullWidth
          InputProps={{
            readOnly: true,
            endAdornment: (
              <InputAdornment position="end">
                <IconButton onClick={() => void copyDev()} disabled={!devUrl} aria-label="Kopiëren dev-link">
                  <FiCopy />
                </IconButton>
              </InputAdornment>
            ),
          }}
          sx={{ mb: 2 }}
          helperText="Zelfde pagina als de preview hieronder; pad onder /display/… op deze dev-server."
        />
      ) : null}

      <Tabs
        value={mainTab}
        onChange={(_, v: MainTab) => {
          setMainTab(v);
          setIframeKey((k) => k + 1);
        }}
        sx={{ mb: 2 }}
      >
        {MAIN_TABS.map((t) => (
          <Tab key={t.id} value={t.id} label={t.label} />
        ))}
      </Tabs>

      {!previewReady ? (
        <Typography color="text.secondary">
          {tabNeedsStalling
            ? "Kies een gemeente met UrlName en een stalling met StallingsID."
            : "Kies een gemeente met UrlName."}
        </Typography>
      ) : (
        <Box
          sx={{
            border: "1px solid #ccc",
            borderRadius: 1,
            overflow: "hidden",
            bgcolor: "#f5f5f5",
          }}
        >
          <Box sx={{ p: 1, bgcolor: "#eee", fontSize: 12 }}>
            Preview: {urls.previewUrl}
            <IconButton
              size="small"
              sx={{ ml: 1 }}
              onClick={() => setIframeKey((k) => k + 1)}
              title="Herladen"
              aria-label="Herladen"
            >
              <FiRefreshCw />
            </IconButton>
          </Box>
          <iframe
            key={iframeKey}
            src={urls.previewUrl}
            title="Display preview"
            style={{
              width: "100%",
              height: mainTab.startsWith("presentaties") ? 720 : 600,
              border: 0,
              display: "block",
              background: "#fff",
            }}
          />
        </Box>
      )}
    </Box>
  );
};

export default StallingsschermenComponent;
