import Link from "next/link";
import { useRouter } from "next/router";
import React, { useEffect, useState } from "react";
import { buttonClass } from "~/components/citizen/CitizenShell";
import { BIKE_TYPES } from "~/modules/buurtstallingen/domain/types";
import { publicWizardNav, type WizardNav } from "~/utils/buurt-wizard-nav";

export type PublicDetail = {
  council: { ID: string; UrlName: string | null; CompanyName: string | null };
  engineEnabled: boolean;
  stalling: { id: string; title: string | null; type: string | null; address: string | null; city: string | null };
  qualifications: string[];
  freeByBikeType: { bikeTypeId: number; free: number }[];
  subscriptionTypes: { id: number; name: string | null; price: string | null }[];
};

export type WizardStep = "fiets" | "rek" | "gegevens" | "bevestiging";

export function needsRek(detail: PublicDetail): boolean {
  return detail.qualifications.includes("UNDER") && detail.qualifications.includes("ABOVE");
}

export function stallingBase(detail: PublicDetail): string {
  const kind = detail.stalling.type === "fietstrommel" ? "fietstrommels" : "buurtstallingen";
  return `/${detail.council.UrlName}/${kind}/${detail.stalling.id}`;
}

function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function dateLabel(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("nl-NL");
}

const primaryBtn = `${buttonClass} inline-block`;
const stepActive = "font-semibold text-[var(--vs-theme1)]";

const PublicFlow: React.FC<{
  detail: PublicDetail;
  step: WizardStep;
  authenticated?: boolean;
  embedded?: boolean;
  nav?: WizardNav;
}> = ({ detail, step, authenticated = false, embedded = false, nav: navProp }) => {
  const router = useRouter();
  const nav = navProp ?? publicWizardNav(stallingBase(detail), detail.council.UrlName);
  const rek = needsRek(detail);
  const bikeTypeId = Number(queryValue(router.query.fiets)) || detail.freeByBikeType[0]?.bikeTypeId || 0;
  const free = detail.freeByBikeType.find((row) => row.bikeTypeId === bikeTypeId)?.free ?? 0;
  const qualification = queryValue(router.query.rek) === "UNDER" ? "UNDER" : "NONE";
  const steps: { id: WizardStep; label: string }[] = [
    { id: "fiets", label: "Fiets" },
    ...(rek ? [{ id: "rek" as const, label: "Rek" }] : []),
    { id: "gegevens", label: "Gegevens" },
    { id: "bevestiging", label: "Bevestiging" },
  ];

  const body = (
    <>
      {!embedded && <p className="text-sm text-gray-600">{detail.council.CompanyName}</p>}
      <h2 className={embedded ? "text-lg font-semibold text-[var(--vs-theme1)]" : "text-2xl font-semibold"}>
        Abonnement {detail.stalling.title}
      </h2>
      <p className="text-sm text-gray-700">{[detail.stalling.address, detail.stalling.city].filter(Boolean).join(", ")}</p>
      <ol className="flex flex-wrap gap-3 text-sm text-gray-500">
        {steps.map((item) => (
          <li key={item.id} className={item.id === step ? stepActive : ""}>{item.label}</li>
        ))}
      </ol>
      {!detail.engineEnabled && <p className="rounded bg-amber-50 p-3 text-sm">Aanvragen lopen nog via de bestaande reserveringsservice.</p>}
      {step === "fiets" && <FietsStep detail={detail} nav={nav} />}
      {step === "rek" && <RekStep nav={nav} bikeTypeId={bikeTypeId} />}
      {step === "gegevens" && (
        <GegevensStep
          detail={detail}
          nav={nav}
          bikeTypeId={bikeTypeId}
          free={free}
          qualification={qualification}
          authenticated={authenticated}
        />
      )}
      {step === "bevestiging" && <BevestigingStep detail={detail} nav={nav} />}
    </>
  );

  if (embedded) {
    return <div className="space-y-4">{body}</div>;
  }
  return (
    <main className="mx-auto my-6 max-w-xl space-y-4 rounded bg-white p-6 text-[#1c2b33]">
      {body}
    </main>
  );
};

const FietsStep: React.FC<{ detail: PublicDetail; nav: WizardNav }> = ({ detail, nav }) => {
  const [bikeTypeId, setBikeTypeId] = useState(detail.freeByBikeType[0]?.bikeTypeId ?? 1);
  const free = detail.freeByBikeType.find((row) => row.bikeTypeId === bikeTypeId)?.free ?? 0;
  const next = needsRek(detail) ? nav.step("rek", { fiets: bikeTypeId }) : nav.step("gegevens", { fiets: bikeTypeId });
  if (detail.freeByBikeType.length === 0) {
    return <p>Deze stalling heeft geen plekken voor een fietstype.</p>;
  }
  return (
    <div className="space-y-3">
      <h3 className="text-base font-semibold">Wat voor soort fiets heeft u?</h3>
      <label className="block text-sm">Fiets
        <select className="mt-1 w-full rounded border p-2" value={bikeTypeId} onChange={(event) => setBikeTypeId(Number(event.target.value))}>
          {detail.freeByBikeType.map((row) => (
            <option key={row.bikeTypeId} value={row.bikeTypeId}>{BIKE_TYPES[row.bikeTypeId] ?? row.bikeTypeId} — {row.free} vrij</option>
          ))}
        </select>
      </label>
      {detail.engineEnabled ? (
        <Link className={primaryBtn} href={next}>
          {free === 0 ? "Plaats mij op de wachtlijst" : "Koop abonnement"}
        </Link>
      ) : (
        <button className={`${primaryBtn} opacity-60`} type="button" disabled>
          {free === 0 ? "Plaats mij op de wachtlijst" : "Koop abonnement"}
        </button>
      )}
    </div>
  );
};

const RekStep: React.FC<{ nav: WizardNav; bikeTypeId: number }> = ({ nav, bikeTypeId }) => (
  <div className="space-y-3">
    <p>Heeft u bezwaar tegen een plek in een bovenrek?</p>
    <div className="flex flex-wrap gap-3">
      <Link className="rounded border px-4 py-2 hover:bg-gray-50" href={nav.step("gegevens", { fiets: bikeTypeId, rek: "UNDER" })}>Ja, alleen een onderrek</Link>
      <Link className={primaryBtn} href={nav.step("gegevens", { fiets: bikeTypeId, rek: "NONE" })}>Nee</Link>
    </div>
  </div>
);

const GegevensStep: React.FC<{
  detail: PublicDetail;
  nav: WizardNav;
  bikeTypeId: number;
  free: number;
  qualification: "NONE" | "UNDER";
  authenticated: boolean;
}> = ({ detail, nav, bikeTypeId, free, qualification, authenticated }) => {
  const router = useRouter();
  const [subscriptionTypeId, setSubscriptionTypeId] = useState(String(detail.subscriptionTypes[0]?.id ?? ""));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [register, setRegister] = useState(false);
  const [signedIn, setSignedIn] = useState(authenticated);
  const [profileLoaded, setProfileLoaded] = useState(!authenticated);
  const [profile, setProfile] = useState({
    sex: "", firstName: "", middleName: "", lastName: "", address: "", addressNr: "", zip: "", city: "", phone: "", mobile: "",
  });
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const waiting = free === 0;
  const knownBike = detail.freeByBikeType.some((row) => row.bikeTypeId === bikeTypeId);

  async function loadProfile() {
    const response = await fetch("/api/buurtstallingen/session");
    if (!response.ok) return false;
    const data = await response.json();
    setProfile((current) => ({ ...current, ...data.profile }));
    setProfileLoaded(true);
    return true;
  }

  useEffect(() => {
    if (authenticated) void loadProfile();
  }, [authenticated]);

  async function submitAanvraag() {
    const response = await fetch("/api/buurtstallingen/aanvraag", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        urlName: detail.council.UrlName,
        stallingId: detail.stalling.id,
        bikeTypeId,
        qualification,
        subscriptionTypeId: waiting ? null : subscriptionTypeId || null,
        wait: waiting,
        profile,
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Aanvraag mislukt");
      return;
    }
    const extra = data.kind === "waiting"
      ? { soort: "wachtlijst", plaats: String(data.sequence ?? "") }
      : { soort: "reservering", tot: data.expiry ?? "" };
    await router.push(nav.step("bevestiging", extra));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting) return;
    setMessage("");
    setSubmitting(true);
    try {
      if (!signedIn) {
        const session = await fetch("/api/buurtstallingen/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            urlName: detail.council.UrlName,
            email,
            password,
            register: register ? profile : undefined,
          }),
        });
        const sessionData = await session.json();
        if (!session.ok) {
          setMessage(sessionData.error ?? "Inloggen mislukt");
          return;
        }
        setSignedIn(true);
        if (!register) {
          await loadProfile();
          setMessage("U bent ingelogd. Controleer uw naam en adres; deze komen op het contract en de machtiging.");
          return;
        }
      }
      await submitAanvraag();
    } finally {
      setSubmitting(false);
    }
  }

  if (!knownBike) {
    return <p>Kies eerst een fiets. <Link className="underline text-[var(--vs-theme1)]" href={nav.start()}>Terug</Link></p>;
  }

  return (
    <form className="space-y-3" onSubmit={submit}>
      <p className="text-sm">{BIKE_TYPES[bikeTypeId] ?? "Fiets"} — {waiting ? "wachtlijst" : `${free} vrij`}</p>
      {!waiting && detail.subscriptionTypes.length > 1 && (
        <label className="block text-sm">Abonnement
          <select className="mt-1 w-full rounded border p-2" value={subscriptionTypeId} onChange={(event) => setSubscriptionTypeId(event.target.value)}>
            {detail.subscriptionTypes.map((form) => (
              <option key={form.id} value={form.id}>{form.name} {form.price ? `€ ${form.price}` : ""}</option>
            ))}
          </select>
        </label>
      )}
      {!signedIn && (
        <>
          <label className="block text-sm">E-mail<input className="mt-1 w-full rounded border p-2" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="block text-sm">Wachtwoord<input className="mt-1 w-full rounded border p-2" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={register} onChange={(event) => setRegister(event.target.checked)} /> Ik heb nog geen account</label>
        </>
      )}
      {(signedIn || register) && (
        <fieldset className="space-y-2">
          <legend className="text-base font-semibold">Uw gegevens</legend>
          <p className="text-sm text-gray-600">Deze gegevens komen op het contract en de machtiging.</p>
          <div className="grid gap-2 md:grid-cols-2">
            <label className="text-sm">Geslacht
              <select className="mt-1 w-full rounded border p-2" value={profile.sex} onChange={(event) => setProfile({ ...profile, sex: event.target.value })}>
                <option value="">—</option>
                <option value="man">Man</option>
                <option value="vrouw">Vrouw</option>
              </select>
            </label>
            {([
              ["firstName", "Voornaam"],
              ["middleName", "Tussenvoegsel"],
              ["lastName", "Achternaam"],
              ["address", "Straat"],
              ["addressNr", "Huisnummer"],
              ["zip", "Postcode"],
              ["city", "Plaats"],
              ["phone", "Telefoon"],
              ["mobile", "Mobiel"],
            ] as const).map(([key, label]) => (
              <label key={key} className="text-sm">{label}
                <input className="mt-1 w-full rounded border p-2" required={key !== "middleName" && key !== "phone" && key !== "mobile"} value={profile[key]} onChange={(event) => setProfile({ ...profile, [key]: event.target.value })} />
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <button className={`${primaryBtn} disabled:opacity-60`} type="submit" disabled={!detail.engineEnabled || submitting || !profileLoaded}>
        {submitting ? "Bezig…" : waiting ? "Op de wachtlijst" : "Reserveer een plek"}
      </button>
      {message && <p>{message}</p>}
    </form>
  );
};

const BevestigingStep: React.FC<{ detail: PublicDetail; nav: WizardNav }> = ({ detail, nav }) => {
  const router = useRouter();
  const soort = queryValue(router.query.soort);
  const tot = dateLabel(queryValue(router.query.tot));
  const plaats = queryValue(router.query.plaats);
  if (soort === "wachtlijst") {
    return (
      <div className="space-y-3">
        <p>U staat op plaats {plaats || "?"} van de wachtlijst van {detail.stalling.title}.</p>
        <Link className="underline text-[var(--vs-theme1)]" href={nav.mijnStalling()}>Mijn stalling</Link>
      </div>
    );
  }
  if (soort === "reservering") {
    return (
      <div className="space-y-3">
        <p>Uw plek is gereserveerd{tot ? ` tot ${tot}` : ""}. Haal de sleutel op vóór die datum. Neem het contract, de machtiging en een identiteitsbewijs mee.</p>
        <Link className="underline text-[var(--vs-theme1)]" href={nav.mijnStalling()}>Mijn stalling</Link>
      </div>
    );
  }
  return <p>Er is nog geen aanvraag afgerond. <Link className="underline text-[var(--vs-theme1)]" href={nav.start()}>Begin bij de fiets</Link></p>;
};

export default PublicFlow;
