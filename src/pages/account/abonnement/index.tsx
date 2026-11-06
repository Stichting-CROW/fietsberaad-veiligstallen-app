import Link from "next/link";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/router";
import PublicFlow, { needsRek, type PublicDetail, type WizardStep } from "~/components/buurtstallingen/PublicFlow";
import { CitizenShell, IdealButton, buttonClass, useCitizenOwner } from "~/components/citizen/CitizenShell";
import { LoadingSpinner } from "~/components/beheer/common/LoadingSpinner";
import { accountWizardNav } from "~/utils/buurt-wizard-nav";

type CatalogForm = { id: number; naam: string | null; prijs: number; stallings: string[]; start: string; end: string };
type CatalogGroup =
  | { id: string; title: string; kind: "forms"; forms: CatalogForm[] }
  | { id: string; title: string; kind: "links"; rows: { key: string; title: string; prijs: number; href: string }[] };
type Catalog = {
  owner: { id: string; name: string; themeColor: string };
  fee: number;
  groups: CatalogGroup[];
  prolong: { ref: string; formId: number | null; error: string } | null;
};
type Checkout = {
  form: { id: number; naam: string | null; prijs: number; ovchip: boolean; conditions: boolean; council: string; siteId: string | null; fietskluizen?: boolean };
  passes: { passId: string; label: string }[];
  fee: number;
  subscription?: { ref: string; paid: boolean; currentPassId: string | null; tempPassAttached: boolean };
};

function query(value: string | string[] | undefined): string {
  return typeof value === "string" ? value : "";
}

const WIZARD_STEPS = new Set<WizardStep>(["fiets", "rek", "gegevens", "bevestiging"]);

function parseWizardStep(value: string): WizardStep | null {
  return WIZARD_STEPS.has(value as WizardStep) ? (value as WizardStep) : null;
}

function BuurtWizardPanel({ siteId, parkingId, step }: { siteId: string; parkingId: string; step: WizardStep }) {
  const router = useRouter();
  const [detail, setDetail] = useState<PublicDetail | null>(null);
  const [error, setError] = useState("");
  const nav = useMemo(() => accountWizardNav(siteId, parkingId), [siteId, parkingId]);

  useEffect(() => {
    setError("");
    void fetch(`/api/account/buurt-wizard?siteId=${encodeURIComponent(siteId)}&parkingId=${encodeURIComponent(parkingId)}`)
      .then(async (response) => {
        if (response.status === 401) {
          await router.replace(`/account/login?next=${encodeURIComponent(router.asPath)}`);
          return null;
        }
        return response.json() as Promise<PublicDetail & { error?: string }>;
      })
      .then((data) => {
        if (!data) return;
        if (data.error) {
          setError(data.error);
          return;
        }
        setDetail(data);
        if (step === "rek" && !needsRek(data)) {
          const fiets = query(router.query.fiets);
          void router.replace(nav.step("gegevens", { fiets: fiets || data.freeByBikeType[0]?.bikeTypeId || 1 }));
        }
      })
      .catch(() => setError("De stalling kon niet worden geladen."));
  }, [siteId, parkingId, step, router, nav]);

  if (error) return <ErrorBox>{error}</ErrorBox>;
  if (!detail) return <LoadingSpinner message="" />;

  return (
    <>
      <p className="mb-4">
        <Link className="underline text-[var(--vs-theme1)]" href={`/account/abonnement?siteId=${encodeURIComponent(siteId)}`}>
          ← Alle abonnementen
        </Link>
      </p>
      <PublicFlow detail={detail} step={step} authenticated embedded nav={nav} />
    </>
  );
}

function euro(value: number): string {
  return value.toFixed(2);
}

export default function AbonnementPage() {
  const router = useRouter();
  const owner = useCitizenOwner();
  const siteId = query(router.query.siteId) || (owner ?? "");
  const parkingId = query(router.query.parkingId);
  const prolongId = query(router.query.prolongId);
  const formId = query(router.query.formId);
  const subscriptionId = query(router.query.subscriptionId);
  const wizardStep = parseWizardStep(query(router.query.wizard));
  const [catalog, setCatalog] = useState<Catalog | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!router.isReady || formId || subscriptionId || wizardStep || owner === undefined) return;
    if (!siteId) {
      void router.replace(`/account/gemeente?next=${encodeURIComponent(router.asPath)}`);
      return;
    }
    async function loadCatalog() {
      setLoading(true);
      setError(query(router.query.error));
      const params = new URLSearchParams({ siteId });
      if (parkingId) params.set("parkingId", parkingId);
      if (prolongId) params.set("prolongId", prolongId);
      try {
        const [data, isLoggedIn] = await Promise.all([
          fetch(`/api/account/abonnement?${params.toString()}`).then(async (response) => response.json()),
          fetch("/api/account/profile").then((response) => response.ok),
        ]);
        setCatalog(data);
        setLoggedIn(isLoggedIn);
      } catch {
        setError("De abonnementen konden niet worden geladen.");
      } finally {
        setLoading(false);
      }
    }

    if (parkingId) {
      void (async () => {
        const wizardTarget = `/account/abonnement?${new URLSearchParams({ siteId, parkingId, wizard: "fiets" }).toString()}`;
        const probe = await fetch(`/api/account/buurt-wizard?siteId=${encodeURIComponent(siteId)}&parkingId=${encodeURIComponent(parkingId)}`);
        if (probe.status === 401) {
          await router.replace(`/account/login?next=${encodeURIComponent(wizardTarget)}`);
          return;
        }
        if (probe.ok) {
          await router.replace(wizardTarget);
          return;
        }
        await loadCatalog();
      })();
      return;
    }

    void loadCatalog();
  }, [router.isReady, router.query.error, siteId, parkingId, prolongId, formId, subscriptionId, wizardStep, owner, router]);

  if (wizardStep && parkingId && siteId && !formId && !subscriptionId) {
    return (
      <CitizenShell title="Abonnement" siteId={siteId} page="Abonnement" pageText={false}>
        <div className="bg-white p-4">
          <BuurtWizardPanel siteId={siteId} parkingId={parkingId} step={wizardStep} />
        </div>
      </CitizenShell>
    );
  }

  function go(next: Record<string, string>) {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
    }
    const qs = params.toString();
    void router.push(qs ? `/account/abonnement?${qs}` : "/account/abonnement");
  }

  if (formId || subscriptionId) {
    return (
      <CitizenShell title="Abonnement" siteId={siteId || null} page="Abonnement" pageText={false}>
        <KoppelPas
          formId={formId ? Number(formId) : null}
          subscriptionId={subscriptionId || null}
          source={query(router.query.source)}
          siteId={siteId}
        />
      </CitizenShell>
    );
  }

  return (
    <CitizenShell title="Abonnement" siteId={siteId} page="Abonnement">
      {error && <ErrorBox>{error}</ErrorBox>}
      {loading || !catalog ? <LoadingSpinner message="" /> : (
        <Kies
          catalog={catalog}
          loggedIn={loggedIn}
          prolongId={prolongId}
          onChoose={(id) => go({ siteId, formId: String(id) })}
          onError={setError}
          loginHref={`/account/login?next=${encodeURIComponent(router.asPath)}`}
        />
      )}
    </CitizenShell>
  );
}

function ErrorBox({ children }: { children: ReactNode }) {
  return <div className="mb-3 border border-red-300 bg-red-50 p-3 text-red-800">{children}</div>;
}

function Kies({
  catalog,
  loggedIn,
  prolongId,
  onChoose,
  onError,
  loginHref,
}: {
  catalog: Catalog;
  loggedIn: boolean;
  prolongId: string;
  onChoose: (formId: number) => void;
  onError: (message: string) => void;
  loginHref: string;
}) {
  const router = useRouter();
  const preselected = catalog.prolong?.formId ?? null;
  const [selected, setSelected] = useState<number | null>(preselected);
  const openGroup = preselected
    ? catalog.groups.find((group) => group.kind === "forms" && group.forms.some((form) => form.id === preselected))?.id
    : catalog.groups[0]?.id;

  async function prolong() {
    if (!selected) {
      onError("Kies een abonnementsvorm");
      return;
    }
    const response = await fetch("/api/account/abonnement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ formId: selected, prolongId }),
    });
    const data = await response.json();
    if (!response.ok) {
      onError(data.error ?? "Abonnement niet aangemaakt");
      return;
    }
    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return;
    }
    const params = new URLSearchParams({ prolongId });
    if (data.transactionID) params.set("transactionID", data.transactionID);
    await router.push(`/account/abonnement/${data.subscriptionRef}?${params.toString()}`);
  }

  function next() {
    if (!selected) {
      onError("Kies een abonnementsvorm");
      return;
    }
    onChoose(selected);
  }

  return (
    <div className="bg-white p-4">
      {catalog.prolong?.error && (
        <ErrorBox>
          {catalog.prolong.error}{" "}
          <a className="underline" href={`/account/abonnement?siteId=${encodeURIComponent(catalog.owner.id)}`}>Koop abonnement</a>
        </ErrorBox>
      )}
      {catalog.groups.map((group) => (
        <details key={group.id} className="group mb-4" open={group.id === openGroup}>
          <summary
            className="flex cursor-pointer list-none items-center justify-between bg-[var(--vs-theme1)] px-3 py-2 text-white hover:bg-[var(--vs-theme2)] [&::-webkit-details-marker]:hidden"
          >
            <span>{group.title}</span>
            <span aria-hidden="true" className="group-open:hidden">▲</span>
            <span aria-hidden="true" className="hidden group-open:inline">▼</span>
          </summary>
          <div className="py-3">
            {group.kind === "forms" ? (
              <>
                {group.forms.map((form) => (
                  <div key={form.id} className="mb-4 flex gap-3">
                    <input
                      id={`radio_subscriptiontype_${form.id}`}
                      className="mt-1"
                      type="radio"
                      name="subscriptiontypeID"
                      checked={selected === form.id}
                      onChange={() => setSelected(form.id)}
                    />
                    <label htmlFor={`radio_subscriptiontype_${form.id}`}>
                      <strong>{form.naam}</strong>
                      <br />€ {euro(form.prijs)} (incl. BTW)
                      {form.stallings.length > 0 && (
                        <span className="block text-sm text-gray-600">Geldig in de volgende stallingen: {form.stallings.join(", ")}</span>
                      )}
                      <table className="text-sm">
                        <tbody>
                          <tr><td className="pr-2">Ingangsdatum</td><td>: {form.start}</td></tr>
                          <tr><td className="pr-2">Einddatum</td><td>: {form.end}</td></tr>
                        </tbody>
                      </table>
                    </label>
                  </div>
                ))}
                {loggedIn ? (
                  <div className="ml-10 mt-4">
                    {catalog.prolong
                      ? <IdealButton fee={catalog.fee} onClick={() => void prolong()} />
                      : <button className={buttonClass} type="button" onClick={next}>Verder</button>}
                  </div>
                ) : (
                  <>
                    <p className="mb-3">
                      U bent niet ingelogd. U kunt alleen een abonnement kopen als u een account hebt aangemaakt bij VeiligStallen en bent ingelogd
                    </p>
                    <a className={buttonClass} href={loginHref}>Log in / registreer</a>
                  </>
                )}
              </>
            ) : (
              <>
                {group.rows.map((row) => (
                  <div key={row.key} className="mb-4 ml-10 flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <strong>{row.title}</strong>
                      <br />€ {euro(row.prijs)} (incl. BTW)
                    </div>
                    <Link className={`${buttonClass} w-[250px]`} href={row.href}>Koop abonnement</Link>
                  </div>
                ))}
                {!loggedIn && (
                  <>
                    <p className="mb-3">
                      U bent niet ingelogd. U kunt alleen een abonnement kopen of u op de wachtlijst plaatsen als u bent ingelogd.
                    </p>
                    <a className={buttonClass} href={loginHref}>Log in / registreer</a>
                  </>
                )}
              </>
            )}
          </div>
        </details>
      ))}
      {catalog.groups.length === 0 && !catalog.prolong?.error && <p className="mb-3">Er zijn voor deze gemeente geen abonnementen beschikbaar.</p>}
    </div>
  );
}

function SplitInput({
  length,
  value,
  onChange,
  fixedFirstBlock,
}: {
  length: number;
  value: string;
  onChange: (value: string) => void;
  fixedFirstBlock?: string;
}) {
  const blocks = Math.ceil(length / 4);
  const padded = value.padEnd(length, " ");
  function setBlock(index: number, next: string) {
    const digits = next.replace(/\D/g, "").slice(0, 4);
    const parts = Array.from({ length: blocks }, (_, block) => padded.slice(block * 4, block * 4 + 4).trim());
    parts[index] = digits;
    onChange(parts.join(""));
    if (digits.length === 4) {
      const following = document.getElementById(`split_${index + 1}`);
      following?.focus();
    }
  }
  return (
    <span className="inline-flex gap-1">
      {Array.from({ length: blocks }, (_, index) => {
        const fixed = index === 0 && fixedFirstBlock;
        return (
          <input
            key={index}
            id={`split_${index}`}
            aria-label={`Cijfers ${index * 4 + 1} tot ${index * 4 + 4}`}
            className="w-16 rounded border border-gray-300 px-2 py-1 text-center font-mono"
            inputMode="numeric"
            maxLength={4}
            readOnly={Boolean(fixed)}
            value={fixed ? fixedFirstBlock : padded.slice(index * 4, index * 4 + 4).trim()}
            onChange={(event) => setBlock(index, event.target.value)}
          />
        );
      })}
    </span>
  );
}

function KoppelPas({
  formId,
  subscriptionId,
  source,
  siteId,
}: {
  formId: number | null;
  subscriptionId: string | null;
  source: string;
  siteId: string;
}) {
  const router = useRouter();
  const [checkout, setCheckout] = useState<Checkout | null>(null);
  const [passID, setPassID] = useState<string | null>(null);
  const [newPass, setNewPass] = useState("");
  const [newPassName, setNewPassName] = useState("");
  const [akkoord, setAkkoord] = useState(false);
  const [akkoordVoorwaarden, setAkkoordVoorwaarden] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");

  useEffect(() => {
    const params = subscriptionId ? `subscriptionId=${encodeURIComponent(subscriptionId)}` : `formId=${formId}`;
    void fetch(`/api/account/abonnement?${params}`).then(async (response) => {
      if (response.status === 401) {
        await router.replace(`/account/login?next=${encodeURIComponent(router.asPath)}`);
        return;
      }
      const data = await response.json() as Checkout & { error?: string };
      if (!response.ok) {
        setError(data.error ?? "Dit abonnement is niet beschikbaar");
        return;
      }
      setCheckout(data);
      if (data.form.ovchip) setNewPass("3528");
      const current = data.subscription?.currentPassId;
      if (current && data.passes.some((pass) => pass.passId === current)) setPassID(current);
    });
  }, [formId, subscriptionId, router]);

  if (!checkout) return error ? <ErrorBox>{error}</ErrorBox> : <LoadingSpinner message="" />;

  const ovchip = checkout.form.ovchip;
  const existing = checkout.subscription;
  const editExistingSubscription = Boolean(existing?.paid);
  const length = ovchip ? 16 : 12;
  const showDummy = !ovchip && !checkout.form.fietskluizen && !editExistingSubscription
    && (!existing || checkout.passes.length === 0 || !existing.currentPassId);
  const showNewOvchip = !editExistingSubscription || !existing?.tempPassAttached;
  const idsGevonden = checkout.passes.length > 0 || showDummy;
  const wantsNew = !idsGevonden || passID === "";
  const showConditions = checkout.form.conditions && !editExistingSubscription;
  const conditionsFormId = checkout.form.id;

  function validate(): boolean {
    setError("");
    if (idsGevonden && passID === null) {
      setError("Kies een pas om te koppelen");
      return false;
    }
    if (ovchip) {
      if (wantsNew && newPass.length !== length) {
        setError(newPass.length === 0 ? "Het veld kaartnummer is verplicht" : "Het ingevoerde kaartnummer is onjuist.");
        return false;
      }
      if (wantsNew && !akkoord) {
        setError("U dient akkoord te gaan met onderstaande voorwaarden");
        return false;
      }
    } else if (wantsNew && newPass.length !== length) {
      setError(newPass.length === 0 ? "Het veld barcode sleutelhanger is verplicht" : "Het ingevoerde sleutelhangernummer is onjuist. Probeer het opnieuw.");
      return false;
    }
    if (showConditions && !akkoordVoorwaarden) {
      setError("U dient akkoord te gaan met de abonnementsvoorwaarden");
      return false;
    }
    return true;
  }

  async function submit() {
    if (!validate()) return;
    setFeedback("");
    const pass = {
      passID: passID ?? "",
      newPass: passID ? "" : newPass,
      newPassName,
      acceptedConditions: akkoordVoorwaarden,
    };
    const response = await fetch("/api/account/abonnement", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(existing ? { mode: "relink", subscriptionId: existing.ref, source, ...pass } : { formId, ...pass }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? (existing ? "De pas is niet gekoppeld" : "Abonnement niet aangemaakt"));
      return;
    }
    if (data.checkoutUrl) {
      window.location.href = data.checkoutUrl;
      return;
    }
    if (data.redirect) {
      await router.push(data.redirect);
      return;
    }
    if (existing) {
      setFeedback(data.feedback ?? "");
      return;
    }
    await router.push(`/account/abonnement/${data.subscriptionRef}${data.transactionID ? `?transactionID=${data.transactionID}` : ""}`);
  }

  return (
    <div className="bg-white p-4">
      {error && <ErrorBox>{error}</ErrorBox>}
      {feedback && <p className="mb-3 font-semibold text-green-700">{feedback}</p>}
      <h2 className="mb-3 text-lg font-semibold">Pas koppelen</h2>
      <div className="space-y-1">
        {checkout.passes.map((pass) => (
          <label key={pass.passId} className="block">
            <input className="mr-2" type="radio" name="passID" checked={passID === pass.passId} onChange={() => setPassID(pass.passId)} />
            {pass.label}
          </label>
        ))}
        {ovchip ? (
          showNewOvchip && (
            checkout.passes.length > 0 ? (
              <label className="mt-3 block">
                <input className="mr-2" type="radio" name="passID" checked={passID === ""} onChange={() => setPassID("")} />
                Voeg nieuwe OV-chipkaart toe
              </label>
            ) : (
              <p>Voeg nieuwe OV-chipkaart toe</p>
            )
          )
        ) : (
          <>
            {showDummy && (
              <label className="mt-3 block">
                <input className="mr-2" type="radio" name="passID" checked={passID === "dummy"} onChange={() => setPassID("dummy")} />
                Ik heb nog geen sleutelhanger
              </label>
            )}
            {idsGevonden && (
              <label className="mt-3 block">
                <input className="mr-2" type="radio" name="passID" checked={passID === ""} onChange={() => setPassID("")} />
                Voeg sleutelhanger toe
              </label>
            )}
          </>
        )}
      </div>
      {wantsNew && (
        <div className="ml-6 mt-3 space-y-2">
          {ovchip ? (
            <SplitInput length={16} value={newPass} onChange={(value) => setNewPass(`3528${value.slice(4)}`)} fixedFirstBlock="3528" />
          ) : (
            <>
              <div>
                <span className="mr-2">Barcode sleutelhanger:</span>
                <SplitInput length={12} value={newPass} onChange={setNewPass} />
              </div>
              <label className="block">
                <span className="mr-2">Omschrijving pas:</span>
                <input
                  className="rounded border border-gray-300 px-2 py-1"
                  placeholder="Bijv. Fiets Piet"
                  value={newPassName}
                  onChange={(event) => setNewPassName(event.target.value)}
                />
              </label>
            </>
          )}
        </div>
      )}
      {showConditions && (
        <label className="mt-6 block">
          <input className="mr-2" type="checkbox" checked={akkoordVoorwaarden} onChange={(event) => setAkkoordVoorwaarden(event.target.checked)} />
          Ik ga akkoord met de{" "}
          <a className="underline" target="_blank" rel="noreferrer" href={`/api/account/document?subscriptiontypeid=${conditionsFormId}&document=conditions`}>abonnementsvoorwaarden</a>
        </label>
      )}
      {ovchip && !checkout.form.fietskluizen && (
        <div className="mt-4 flex gap-2 text-[90%]">
          <input type="checkbox" checked={akkoord} onChange={(event) => setAkkoord(event.target.checked)} aria-label="Toestemming OV-chipkaart" />
          <div className="space-y-2">
            <p>
              Ik geef toestemming aan de Gemeente {checkout.form.council}, GVB Amsterdam en de uitgever van de OV-chipkaart Translink om mijn persoonsgegevens te verwerken voor het kunnen gebruiken van mijn OV-chipkaart als identificatiemiddel voor mijn fietsparkeerabonnement.
            </p>
            <p>
              Verstrekken van uw persoonsgegevens, te weten uw OV-chipkaartidentifactie, houdt in dat Translink het interne kaartnummer (chip-id) dat behoort bij het op uw kaart afgedrukte nummer (engraved-id) verstrekt. U kunt de OV-chipkaart daarna gebruiken om u te identificeren als geaccepteerde gebruiker.
            </p>
            <p>
              Translink verstrekt niet uw naam, adres, woonplaatsgegevens of andere gegevens die Translinkover u verwerkt. De verstrekking van de OV-chipkaartidentificatie zal door Translink worden stopgezet indien u uw abonnement beëindigt.
            </p>
          </div>
        </div>
      )}
      <div className="mt-6">
        {editExistingSubscription
          ? <button className={buttonClass} type="button" onClick={() => void submit()}>Koppel</button>
          : <IdealButton fee={checkout.fee} onClick={() => void submit()} />}
      </div>
      <button
        className="mt-4 block underline"
        type="button"
        onClick={() => void router.push(source === "mijngegevens" ? "/account?showForm=abonnementen" : `/account/abonnement?siteId=${encodeURIComponent(siteId || checkout.form.siteId || "")}`)}
      >
        Terug
      </button>
    </div>
  );
}
