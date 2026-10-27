import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  FormControlLabel,
  Paper,
  Tab,
  Tabs,
  TextField,
  Typography,
} from "@mui/material";
import Link from "next/link";
import SnapshotProgress, { type SnapshotPhaseView } from "./SnapshotProgress";

type Owner = { id: string; name: string | null; gemeenteCode: number | null; zipId: string | null };
type Named = { id: string; name: string | null };
type Stalling = {
  id: string;
  stallingsId: string | null;
  title: string | null;
  siteId: string | null;
  exploitantId: string | null;
  typeId: string | null;
  typeName: string | null;
};
type Catalog = { prodAvailable: boolean; owners: Owner[]; exploitants: Named[]; stallingen: Stalling[] };
type Job = {
  status: "running" | "done" | "error";
  step: string;
  phases?: SnapshotPhaseView[];
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
  const [ownerQuery, setOwnerQuery] = useState("");
  const [stallingQuery, setStallingQuery] = useState("");
  const [typeFilters, setTypeFilters] = useState<string[]>([]);
  const [from, setFrom] = useState(defaultFrom);
  const [to, setTo] = useState(() => new Date().toISOString().slice(0, 10));
  const [confirm, setConfirm] = useState("");
  const [copyAllOwnerAccounts, setCopyAllOwnerAccounts] = useState(false);
  const [copyAllOwnerBarcodes, setCopyAllOwnerBarcodes] = useState(false);
  const [tab, setTab] = useState(2);
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

  const stallingTypes = useMemo(() => {
    const names = new Map<string, string>();
    for (const stalling of catalog?.stallingen ?? []) {
      const id = stalling.typeId?.trim();
      if (!id || names.has(id)) continue;
      names.set(id, stalling.typeName?.trim() || id);
    }
    return [...names.entries()]
      .map(([id, name]) => ({ id, name }))
      .sort((left, right) => left.name.localeCompare(right.name, "nl"));
  }, [catalog?.stallingen]);

  const visibleOwners = useMemo(() => {
    const query = ownerQuery.trim().toLowerCase();
    if (!query || !catalog) return catalog?.owners ?? [];
    return catalog.owners.filter((owner) => {
      const name = (owner.name || "").toLowerCase();
      const code = owner.gemeenteCode == null ? "" : String(owner.gemeenteCode);
      return name.includes(query) || code.includes(query);
    });
  }, [catalog, ownerQuery]);

  const visibleStallingen = useMemo(() => {
    const query = stallingQuery.trim().toLowerCase();
    return (catalog?.stallingen ?? []).filter((stalling) => {
      if (typeFilters.length > 0 && !typeFilters.includes(stalling.typeId || "")) return false;
      if (!query) return true;
      const title = (stalling.title || "").toLowerCase();
      const code = (stalling.stallingsId || "").toLowerCase();
      return title.includes(query) || code.includes(query);
    });
  }, [catalog?.stallingen, stallingQuery, typeFilters]);

  const toggle = (id: string, set: React.Dispatch<React.SetStateAction<string[]>>) => {
    set((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  };

  const phasesFinished = !!job?.phases?.length && job.phases.every((phase) => phase.state === "done" || phase.state === "error");
  const snapshotRunning = (busy || job?.status === "running") && !phasesFinished;
  const confirmReady = confirm.trim() === "WISSEN";

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
          copyAllOwnerAccounts,
          copyAllOwnerBarcodes,
          confirm,
        }),
      });
      const body = await response.json() as { error?: string; job?: Job };
      if (!response.ok && response.status !== 202) throw new Error(body.error || "Snapshot starten mislukt");
      setJob(body.job ?? null);
      if (body.job?.status !== "running") setBusy(false);
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : String(actionError));
      setBusy(false);
    }
  };

  const applyStatus = (response: Response, body: { job?: Job | null }) => {
    if (!response.ok || !Object.prototype.hasOwnProperty.call(body, "job")) return;
    const next = body.job ?? null;
    setJob(next);
    if (!next || next.status !== "running") setBusy(false);
  };

  useEffect(() => {
    fetch("/api/protected/test-env/status")
      .then(async (response) => applyStatus(response, await response.json()))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    if (job?.status !== "running" || phasesFinished) setBusy(false);
  }, [job?.status, phasesFinished]);

  useEffect(() => {
    if (job?.status !== "running" || phasesFinished) return;
    const timer = setInterval(() => {
      fetch("/api/protected/test-env/status")
        .then(async (response) => applyStatus(response, await response.json()))
        .catch(() => undefined);
    }, 2000);
    return () => clearInterval(timer);
  }, [job?.status]);

  return (
    <Box sx={{
      display: "flex",
      flexDirection: "column",
      gap: 2,
      width: "100%",
      height: "calc(100vh - 64px - 48px)",
      minHeight: 0,
      "@media (min-width: 1024px)": { height: "calc(100vh - 64px - 64px)" },
    }}>
      <Box sx={{ flexShrink: 0 }}>
        <Typography variant="h5">Acceptatie (docker)</Typography>
        <Typography variant="body2">
          Vult de database van deze teststack. Productiegegevens worden alleen gelezen als <code>PROD_DATABASE_URL</code> op deze machine staat.
        </Typography>
      </Box>
      {error && <Alert severity="error" sx={{ flexShrink: 0 }}>{error}</Alert>}
      {info && <Alert severity="success" sx={{ flexShrink: 0 }}>{info}</Alert>}

      <Tabs value={tab} onChange={(_, value: number) => setTab(value)} sx={{ flexShrink: 0 }}>
        <Tab label="Instructies" />
        <Tab label="Teststalling" />
        <Tab label="Productiesnapshot" />
        <Tab label="Opties" />
        <Tab label="Notities" />
      </Tabs>

      <Paper sx={{ p: 2, flex: 1, minHeight: 0, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        {tab === 0 && (
          <Box sx={{ overflow: "auto", flex: 1, minHeight: 0 }}>
            <Typography variant="h6">Instructies</Typography>
            <Typography variant="body2" sx={{ mt: 1, mb: 2 }}>
              MySQL draait in Docker. De app draait op deze machine met <code>npm run dev</code>, zodat een productiekopie hier gelezen kan worden. De doeldatabase moet <code>acc_docker</code> heten, op localhost, en mag niet dezelfde server zijn als <code>PROD_DATABASE_URL</code>.
            </Typography>
            <Typography variant="subtitle2">1. Docker-omgeving</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Kopieer <code>docker/acceptance/env.example</code> naar <code>docker/acceptance/.env</code> als dat bestand er nog niet is. Zet daar geen <code>PROD_DATABASE_URL</code> in.
            </Typography>
            <Typography variant="subtitle2">2. Database</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <code>npm run docker-acc:db:up</code> start MySQL op <code>127.0.0.1:5556</code>, database <code>acc_docker</code>, gebruiker <code>veiligstallen</code>. Het wachtwoord is <code>MYSQL_PASSWORD</code> uit <code>docker/acceptance/.env</code>. <code>npm run docker-acc:db:down</code> stopt MySQL en bewaart de data.
            </Typography>
            <Typography variant="subtitle2">3. App-variabelen</Typography>
            <Typography variant="body2" component="div" sx={{ mb: 1 }}>
              Zet dit in <code>.env</code> of <code>.env.local</code>. Een waarde in <code>.env.local</code> wint. Laat een uitgecommentarieerde <code>PROD_DATABASE_URL</code> uitgecommentarieerd.
              <ul>
                <li><code>DATABASE_URL=mysql://veiligstallen:&lt;MYSQL_PASSWORD&gt;@127.0.0.1:5556/acc_docker</code></li>
                <li><code>TEST_ENV_BOOTSTRAP=1</code></li>
                <li><code>NEXT_PUBLIC_APP_ENV</code> mag niet <code>production</code> zijn</li>
                <li><code>PROD_DATABASE_URL</code> wijst naar een alleen-lezen bron op een andere host of poort</li>
                <li><code>MOLLIE_TEST_API_KEY</code> en <code>MOLLIE_TEST_ID</code></li>
                <li><code>NEXTAUTH_URL=http://localhost:3000/login</code></li>
              </ul>
              Source <code>docker/acceptance/.env</code> niet in dezelfde shell als <code>npm run dev</code>. Dat bestand zet <code>NEXTAUTH_URL</code> op poort 3010 en de login verwijst dan naar het verkeerde adres.
            </Typography>
            <Typography variant="subtitle2">4. Schema en login, eenmalig</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              <code>npx prisma db push</code> maakt de tabellen. <code>npm run docker-acc:seed-admin</code> maakt de login <code>beheer@example.test</code> / <code>teststalling</code> op Fietsberaad.
            </Typography>
            <Typography variant="subtitle2">5. App en kopie</Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              <code>npm run dev</code>, dan deze pagina. Op Productiesnapshot kies je organisaties en stallingen, een periode, en typ je <code>WISSEN</code>. De bron wordt alleen gelezen. Bibliotheekbestanden komen in <code>docker/acceptance/library</code>.
            </Typography>
            <Typography variant="subtitle2">Hele stack in Docker</Typography>
            <Typography variant="body2">
              <code>npm run docker-acc:up</code> bouwt ook de app, op <code>http://127.0.0.1:3010</code>. Die run maakt het schema en de login zelf. Mail komt binnen op Mailpit, <code>http://127.0.0.1:8025</code>. Een productiekopie doe je vanaf de host-app hierboven, niet vanuit die container.
            </Typography>
          </Box>
        )}
        {tab === 1 && (
          <Box>
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
          </Box>
        )}
        {tab === 3 && (
          <Box>
            <Typography variant="h6">Opties</Typography>
            <FormControlLabel
              sx={{ display: "flex", mx: 0, mt: 1, alignItems: "flex-start" }}
              control={<Checkbox size="small" checked={copyAllOwnerAccounts} onChange={(event) => setCopyAllOwnerAccounts(event.target.checked)} />}
              label="Alle passen en accounts kopiëren voor de geselecteerde data-eigenaren"
            />
            <Typography variant="body2" color="text.secondary" sx={{ pl: 4, mb: 1 }}>
              Standaard uit. Abonnementen die de gekozen periode overlappen, en passen en accounts bij de gekopieerde bezoeken en betalingen, gaan altijd mee.
            </Typography>
            <FormControlLabel
              sx={{ display: "flex", mx: 0, alignItems: "flex-start" }}
              control={<Checkbox size="small" checked={copyAllOwnerBarcodes} onChange={(event) => setCopyAllOwnerBarcodes(event.target.checked)} />}
              label="Alle barcodes kopiëren voor de geselecteerde data-eigenaren"
            />
            <Typography variant="body2" color="text.secondary" sx={{ pl: 4 }}>
              Standaard uit. Dan gaan alleen barcodes mee die op een gekopieerde pas, een abonnement, een bezoek of een betaling staan.
            </Typography>
          </Box>
        )}
        {tab === 4 && (
          <Box sx={{ overflow: "auto", flex: 1, minHeight: 0 }}>
            <Typography variant="h6">Notities</Typography>
            <Typography variant="body2" sx={{ mt: 1, mb: 2 }}>
              Van de 114 tabellen in het datamodel worden er 68 gekopieerd, beperkt tot de gekozen organisaties, stallingen en periode. De andere blijven leeg.
            </Typography>
            <Typography variant="subtitle2">Mee voor de selectie</Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Basisgegevens (rollen, fietstypen, tariefcodes, instellingen), de gekozen organisaties en hun contacten, stallingen met secties, capaciteit per fietstype en tariefregels, abonnementen, gebruikers, accounts en passen die bij de periode horen, bezoeken, en de rapportcaches transacties_archief_day_cache, stallingsduur_cache en bezettingsdata_day_hour_cache.
            </Typography>
            <Typography variant="body2" sx={{ mb: 2 }}>
              user_status gaat mee voor de gekopieerde gebruikers, zodat gearchiveerde beheerders gearchiveerd blijven. contacts_datakwaliteitcontroles gaat mee voor de gekopieerde contacten, maar alleen als de controleur ook is gekopieerd.
            </Typography>
            <Typography variant="subtitle2">Blijft bewust leeg</Typography>
            <Typography variant="body2" component="div">
              <ul>
                <li>Oude en nieuwe FMS-wachtrijen. Onverwerkte rijen zouden op de testomgeving opnieuw verwerkt kunnen worden.</li>
                <li>emails. Een mailproces zou productieberichten kunnen versturen.</li>
                <li>webservice_log, fmsservicelog, bikeparklog en users_beheerder_log. Diagnostiek, geen stallingsgegevens. webservice_log is ongeveer 5 GB.</li>
                <li>Fietsenwin: trekkingen, prijzenpot, prijswinnaars, winkansen en de bijbehorende log- en audittabellen. De prijscatalogus en het winkansenschema van de stalling gaan wel mee.</li>
                <li>unieke_bezoekers en rapportageinfo. De rapporten in deze app gebruiken de drie caches. Oude exporthistorie wordt niet gelezen.</li>
                <li>Mailinglijsten, leden en verzonden berichten. De standaardteksten gaan wel mee.</li>
                <li>Tijdelijke importtabellen, schema_version, lopers en log.</li>
                <li>NextAuth-tabellen, de parkeersimulatie en de historie van privacy-retentie. Die horen bij deze omgeving, niet bij productie. Een snapshot wist de lokale simulatie.</li>
              </ul>
            </Typography>
          </Box>
        )}
        {tab === 2 && !catalog?.prodAvailable && (
          <Alert severity="info" sx={{ my: 1 }}>Productiekopie is niet beschikbaar op deze server.</Alert>
        )}
        {tab === 2 && catalog?.prodAvailable && (
          <Box sx={{ display: "flex", flexDirection: "column", gap: 1, flex: 1, minHeight: 0 }}>
            <Box sx={{
              display: "grid",
              gridTemplateColumns: { xs: "1fr", md: "1fr 1fr 1.4fr" },
              gap: 2,
              flex: 1,
              minHeight: 0,
              gridTemplateRows: "minmax(0, 1fr)",
            }}>
              <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
                <Typography variant="subtitle2">Data-eigenaren</Typography>
                <TextField
                  size="small"
                  placeholder="Zoek data-eigenaar"
                  value={ownerQuery}
                  onChange={(event) => setOwnerQuery(event.target.value)}
                  sx={{ my: 1 }}
                />
                <Box sx={{ overflow: "auto", flex: 1, minHeight: 0 }}>
                  {visibleOwners.map((owner) => (
                    <FormControlLabel
                      key={owner.id}
                      sx={{ display: "flex", mx: 0 }}
                      control={<Checkbox size="small" checked={ownerIds.includes(owner.id)} onChange={() => {
                        const next = ownerIds.includes(owner.id) ? ownerIds.filter((id) => id !== owner.id) : [...ownerIds, owner.id];
                        setOwnerIds(next);
                        setExploitantIds([]);
                        setStallingIds([]);
                        setTypeFilters([]);
                        loadCatalog(next, []).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : String(loadError)));
                      }} />}
                      label={owner.name || owner.id}
                    />
                  ))}
                </Box>
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
                <Typography variant="subtitle2">Exploitanten</Typography>
                <Box sx={{ overflow: "auto", flex: 1, minHeight: 0, mt: 1 }}>
                  {catalog.exploitants.map((exploitant) => (
                    <FormControlLabel
                      key={exploitant.id}
                      sx={{ display: "flex", mx: 0 }}
                      control={<Checkbox size="small" checked={exploitantIds.includes(exploitant.id)} onChange={() => {
                        const next = exploitantIds.includes(exploitant.id) ? exploitantIds.filter((id) => id !== exploitant.id) : [...exploitantIds, exploitant.id];
                        setExploitantIds(next);
                        setTypeFilters([]);
                        loadCatalog(ownerIds, next).catch((loadError: unknown) => setError(loadError instanceof Error ? loadError.message : String(loadError)));
                      }} />}
                      label={exploitant.name || exploitant.id}
                    />
                  ))}
                </Box>
              </Box>
              <Box sx={{ display: "flex", flexDirection: "column", minHeight: 0, height: "100%" }}>
                <Typography variant="subtitle2">Stallingen</Typography>
                <TextField
                  size="small"
                  placeholder="Zoek stalling"
                  value={stallingQuery}
                  onChange={(event) => setStallingQuery(event.target.value)}
                  sx={{ my: 1 }}
                />
                {stallingTypes.length > 0 && (
                  <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.5, mb: 1 }}>
                    {stallingTypes.map((type) => {
                      const on = typeFilters.includes(type.id);
                      return (
                        <Chip
                          key={type.id}
                          label={type.name}
                          size="small"
                          color={on ? "primary" : "default"}
                          variant={on ? "filled" : "outlined"}
                          onClick={() => setTypeFilters((current) => current.includes(type.id) ? current.filter((id) => id !== type.id) : [...current, type.id])}
                        />
                      );
                    })}
                  </Box>
                )}
                <Box sx={{ overflow: "auto", flex: 1, minHeight: 0 }}>
                  {visibleStallingen.map((stalling) => (
                    <FormControlLabel
                      key={stalling.id}
                      sx={{ display: "flex", mx: 0 }}
                      control={<Checkbox size="small" checked={stallingIds.includes(stalling.id)} onChange={() => toggle(stalling.id, setStallingIds)} />}
                      label={stalling.title || stalling.stallingsId || stalling.id}
                    />
                  ))}
                </Box>
              </Box>
            </Box>
            <Box sx={{ display: "flex", gap: 2, flexShrink: 0 }}>
              <TextField label="Van" type="date" value={from} onChange={(event) => setFrom(event.target.value)} InputLabelProps={{ shrink: true }} />
              <TextField label="Tot" type="date" value={to} onChange={(event) => setTo(event.target.value)} InputLabelProps={{ shrink: true }} />
              <TextField label="Typ WISSEN" value={confirm} onChange={(event) => setConfirm(event.target.value)} />
            </Box>
            <Button variant="contained" color="warning" disabled={snapshotRunning || !confirmReady || stallingIds.length === 0} onClick={() => void startSnapshot()}>
              Snapshot laden
            </Button>
            {!snapshotRunning && (!confirmReady || stallingIds.length === 0) && (
              <Typography variant="body2" color="text.secondary">
                {stallingIds.length === 0 ? "Kies minstens één stalling. " : ""}
                {!confirmReady ? "Typ WISSEN om de doeldatabase te vervangen." : ""}
              </Typography>
            )}
          </Box>
        )}
        {tab === 2 && job && (
          <Box sx={{ mt: 1, flexShrink: 0 }}>
            {job.phases && job.phases.length > 0 ? (
              <SnapshotProgress phases={job.phases} />
            ) : (
              <Typography variant="body2">Status: {job.status} — {job.step}</Typography>
            )}
            {job.error && <Alert severity="error" sx={{ mt: 1 }}>{job.error}</Alert>}
            {job.logins.length > 0 && (
              <Typography variant="body2" sx={{ mt: 1 }}>
                Inloggen: {job.logins.map((login) => `${login.username} / ${login.password}`).join(", ")}
              </Typography>
            )}
            {job.status === "done" && (
              <Typography variant="body2">Bibliotheek: {job.libraryFiles} bestanden opgeslagen in <code>docker/acceptance/library</code>. Die map gaat mee als de database op een andere server draait.</Typography>
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
