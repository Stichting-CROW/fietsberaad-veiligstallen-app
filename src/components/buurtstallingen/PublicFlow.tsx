import Link from "next/link";
import { useRouter } from "next/router";
import React, { useState } from "react";
import { BIKE_TYPES } from "~/modules/buurtstallingen/domain/types";

export type PublicDetail = {
  council: { UrlName: string | null; CompanyName: string | null };
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

const PublicFlow: React.FC<{ detail: PublicDetail; step: WizardStep }> = ({ detail, step }) => {
  const router = useRouter();
  const base = stallingBase(detail);
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

  return (
    <main className="mx-auto my-6 max-w-xl space-y-4 rounded bg-white p-6 text-gray-900">
      <p className="text-sm text-gray-600">{detail.council.CompanyName}</p>
      <h1 className="text-2xl font-semibold">{detail.stalling.title}</h1>
      <p>{[detail.stalling.address, detail.stalling.city].filter(Boolean).join(", ")}</p>
      <ol className="flex gap-3 text-sm text-gray-500">
        {steps.map((item) => (
          <li key={item.id} className={item.id === step ? "font-semibold text-sky-800" : ""}>{item.label}</li>
        ))}
      </ol>
      {!detail.engineEnabled && <p className="rounded bg-amber-50 p-3 text-sm">Aanvragen lopen nog via de bestaande reserveringsservice.</p>}
      {step === "fiets" && <FietsStep detail={detail} base={base} />}
      {step === "rek" && <RekStep detail={detail} base={base} bikeTypeId={bikeTypeId} />}
      {step === "gegevens" && (
        <GegevensStep detail={detail} base={base} bikeTypeId={bikeTypeId} free={free} qualification={qualification} />
      )}
      {step === "bevestiging" && <BevestigingStep detail={detail} base={base} />}
    </main>
  );
};

const FietsStep: React.FC<{ detail: PublicDetail; base: string }> = ({ detail, base }) => {
  const [bikeTypeId, setBikeTypeId] = useState(detail.freeByBikeType[0]?.bikeTypeId ?? 1);
  const free = detail.freeByBikeType.find((row) => row.bikeTypeId === bikeTypeId)?.free ?? 0;
  const next = needsRek(detail) ? `${base}/rek?fiets=${bikeTypeId}` : `${base}/gegevens?fiets=${bikeTypeId}`;
  if (detail.freeByBikeType.length === 0) {
    return <p>Deze stalling heeft geen plekken voor een fietstype.</p>;
  }
  return (
    <div className="space-y-3">
      <label className="block text-sm">Fiets
        <select className="mt-1 w-full rounded border p-2" value={bikeTypeId} onChange={(event) => setBikeTypeId(Number(event.target.value))}>
          {detail.freeByBikeType.map((row) => (
            <option key={row.bikeTypeId} value={row.bikeTypeId}>{BIKE_TYPES[row.bikeTypeId] ?? row.bikeTypeId} — {row.free} vrij</option>
          ))}
        </select>
      </label>
      {detail.engineEnabled ? (
        <Link className="inline-block rounded bg-sky-700 px-4 py-2 text-white" href={next}>
          {free === 0 ? "Plaats mij op de wachtlijst" : "Koop abonnement"}
        </Link>
      ) : (
        <button className="rounded bg-sky-700 px-4 py-2 text-white" type="button" disabled>
          {free === 0 ? "Plaats mij op de wachtlijst" : "Koop abonnement"}
        </button>
      )}
    </div>
  );
};

const RekStep: React.FC<{ detail: PublicDetail; base: string; bikeTypeId: number }> = ({ base, bikeTypeId }) => (
  <div className="space-y-3">
    <p>Heeft u bezwaar tegen een plek in een bovenrek?</p>
    <div className="flex gap-3">
      <Link className="rounded border px-4 py-2" href={`${base}/gegevens?fiets=${bikeTypeId}&rek=UNDER`}>Ja, alleen een onderrek</Link>
      <Link className="rounded bg-sky-700 px-4 py-2 text-white" href={`${base}/gegevens?fiets=${bikeTypeId}&rek=NONE`}>Nee</Link>
    </div>
  </div>
);

const GegevensStep: React.FC<{
  detail: PublicDetail;
  base: string;
  bikeTypeId: number;
  free: number;
  qualification: "NONE" | "UNDER";
}> = ({ detail, base, bikeTypeId, free, qualification }) => {
  const router = useRouter();
  const [subscriptionTypeId, setSubscriptionTypeId] = useState(String(detail.subscriptionTypes[0]?.id ?? ""));
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [register, setRegister] = useState(false);
  const [profile, setProfile] = useState({
    sex: "M", firstName: "", middleName: "", lastName: "", address: "", addressNr: "", zip: "", city: "", phone: "", mobile: "",
  });
  const [message, setMessage] = useState("");
  const waiting = free === 0;
  const knownBike = detail.freeByBikeType.some((row) => row.bikeTypeId === bikeTypeId);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setMessage("");
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
      }),
    });
    const data = await response.json();
    if (!response.ok) {
      setMessage(data.error ?? "Aanvraag mislukt");
      return;
    }
    const query = data.kind === "waiting"
      ? `soort=wachtlijst&plaats=${data.sequence ?? ""}`
      : `soort=reservering&tot=${encodeURIComponent(data.expiry ?? "")}`;
    await router.push(`${base}/bevestiging?${query}`);
  }

  if (!knownBike) {
    return <p>Kies eerst een fiets. <Link className="underline" href={base}>Terug</Link></p>;
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
      <label className="block text-sm">E-mail<input className="mt-1 w-full rounded border p-2" type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
      <label className="block text-sm">Wachtwoord<input className="mt-1 w-full rounded border p-2" type="password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={register} onChange={(event) => setRegister(event.target.checked)} /> Ik heb nog geen account</label>
      {register && (
        <div className="grid gap-2 md:grid-cols-2">
          <label className="text-sm">Geslacht
            <select className="mt-1 w-full rounded border p-2" value={profile.sex} onChange={(event) => setProfile({ ...profile, sex: event.target.value })}>
              <option value="M">Man</option>
              <option value="V">Vrouw</option>
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
      )}
      <button className="rounded bg-sky-700 px-4 py-2 text-white" type="submit" disabled={!detail.engineEnabled}>
        {waiting ? "Op de wachtlijst" : "Reserveer een plek"}
      </button>
      {message && <p>{message}</p>}
    </form>
  );
};

const BevestigingStep: React.FC<{ detail: PublicDetail; base: string }> = ({ detail, base }) => {
  const router = useRouter();
  const soort = queryValue(router.query.soort);
  const tot = dateLabel(queryValue(router.query.tot));
  const plaats = queryValue(router.query.plaats);
  if (soort === "wachtlijst") {
    return (
      <div className="space-y-3">
        <p>U staat op plaats {plaats || "?"} van de wachtlijst van {detail.stalling.title}.</p>
        <Link className="underline" href={`/${detail.council.UrlName}/mijn-stalling`}>Mijn stalling</Link>
      </div>
    );
  }
  if (soort === "reservering") {
    return (
      <div className="space-y-3">
        <p>Uw plek is gereserveerd{tot ? ` tot ${tot}` : ""}. Haal de sleutel op vóór die datum. Neem het contract, de machtiging en een identiteitsbewijs mee.</p>
        <Link className="underline" href={`/${detail.council.UrlName}/mijn-stalling`}>Mijn stalling</Link>
      </div>
    );
  }
  return <p>Er is nog geen aanvraag afgerond. <Link className="underline" href={base}>Begin bij de fiets</Link></p>;
};

export default PublicFlow;
