import Link from "next/link";
import { useEffect, useState, type ChangeEvent } from "react";
import { useRouter } from "next/router";
import { CitizenShell, Field, Section, buttonClass, inputClass, useCitizenOwner } from "~/components/citizen/CitizenShell";

type Home = {
  email: string | null;
  sex: string | null;
  firstName: string | null;
  middleName: string | null;
  lastName: string | null;
  address: string | null;
  addressNr: string | null;
  zip: string | null;
  city: string | null;
  phone: string | null;
  mobile: string | null;
  nieuwsbrief: boolean;
  saldo: number;
  passes: { id: string; pasId: string; type: string; name: string | null }[];
};

type Feedback = { text: string; bold?: boolean }[];
type Mine = {
  subscriptions: {
    id: number;
    ref: string;
    siteId: string | null;
    pass: string;
    title: string;
    hasPlace: boolean;
    start: string;
    end: string;
    actions: { kind: "prolong" | "pass"; label: string }[];
  }[];
  places: { placeId: string; stallingTitle: string; sectionTitle: string; placeTitle: string; status: string; statusLabel: string; expiry: string | null }[];
  waitingList: { id: string; stallingTitle: string; bikeTypes: string[]; qualification: string; sequence: number | null; since: string | null }[];
};

type Transactions = {
  visits: { checkin: string; checkout: string | null; stallingId: string | null; title: string | null; amount: number }[];
  payments: { id: string; date: string | null; description: string | null; amount: number; status: string | null }[];
};

export default function AccountPage() {
  const router = useRouter();
  const owner = useCitizenOwner();
  const [home, setHome] = useState<Home | null>(null);
  const [transactions, setTransactions] = useState<Transactions | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pasId, setPasId] = useState("");
  const [pasType, setPasType] = useState<"sleutelhanger" | "ovchip">("sleutelhanger");
  const [showFailed, setShowFailed] = useState(false);
  const showForm = typeof router.query.showForm === "string" ? router.query.showForm : "";

  async function load() {
    const profile = await fetch("/api/account/profile");
    if (profile.status === 401) {
      await router.replace("/account/login");
      return;
    }
    setHome(await profile.json());
    const txs = await fetch("/api/account/transactions");
    if (txs.ok) setTransactions(await txs.json());
  }

  useEffect(() => {
    void load();
  }, []);

  async function save(body: object, ok: string) {
    setError("");
    const response = await fetch("/api/account/profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Opslaan mislukt");
      return;
    }
    setMessage(ok);
    await load();
  }

  if (!home) return <CitizenShell title="Mijn gegevens" page="MijnGegevens"><p>Laden…</p></CitizenShell>;

  return (
    <CitizenShell title="Mijn gegevens" page="MijnGegevens">
      {message && <p className="mb-3 rounded bg-green-50 p-3">{message}</p>}
      {error && <p className="mb-3 rounded bg-red-50 p-3 text-red-800">{error}</p>}
      <p className="mb-3">Stallingstegoed: € {home.saldo.toFixed(2)}.</p>

      <Section title="Mijn inloggegevens wijzigen">
        <LoginForm email={home.email ?? ""} onSave={save} />
      </Section>
      <Section title="Mijn instellingen wijzigen">
        <label className="text-sm">
          <input type="checkbox" defaultChecked={home.nieuwsbrief} onChange={(event) => void save({ nieuwsbrief: event.target.checked }, "Instellingen gewijzigd")} /> Nieuwsbrief
        </label>
      </Section>
      <Section title="Mijn passen en codes" open>
        {home.passes.length === 0 && <p>U heeft nog geen pas gekoppeld.</p>}
        <ul className="space-y-2">
          {home.passes.map((pass) => (
            <li key={pass.id} className="flex justify-between gap-3">
              <span>{pass.type}: {pass.pasId} {pass.name ? `(${pass.name})` : ""}</span>
              <button type="button" className={buttonClass} onClick={() => void removePass(pass.id, setError, setMessage, load)}>Verwijderen</button>
            </li>
          ))}
        </ul>
        <Field label="Pastype">
          <select className={inputClass} value={pasType} onChange={(event) => setPasType(event.target.value as "sleutelhanger" | "ovchip")}>
            <option value="sleutelhanger">Sleutelhanger</option>
            <option value="ovchip">OV-chipkaart</option>
          </select>
        </Field>
        <Field label="Pasnummer">
          <input className={inputClass} value={pasId} onChange={(event) => setPasId(event.target.value)} />
        </Field>
        <button className={buttonClass} type="button" onClick={() => void addPass(pasId, pasType, owner ?? null, setError, setMessage, setPasId, load)}>ID toevoegen</button>
      </Section>
      <MijnAbonnementen open={showForm === "abonnementen" || showForm === "buurtstallingen"} forceShow={Boolean(showForm)} />
      {(transactions?.visits.length ?? 0) > 0 && (
        <Section title="Mijn stallingstransacties">
          <VisitTable rows={transactions?.visits ?? []} />
        </Section>
      )}
      {(transactions?.payments.length ?? 0) > 0 && (
        <Section title="Mijn betalingstransacties">
          <label className="mb-2 flex items-center gap-2 text-sm">
            <input type="checkbox" checked={showFailed} onChange={(event) => setShowFailed(event.target.checked)} />
            Mislukte transacties
          </label>
          <table className="w-full text-sm">
            <thead><tr><th className="text-left">Datum</th><th className="text-left">Omschrijving</th><th className="text-right">Bij/af</th></tr></thead>
            <tbody>
              {(transactions?.payments ?? []).filter((row) => showFailed || !FAILED_PAYMENT_LABELS[row.status ?? ""]).map((row) => (
                <tr key={row.id} className={FAILED_PAYMENT_LABELS[row.status ?? ""] ? "text-gray-500" : ""}>
                  <td className="whitespace-nowrap">{dateTime(row.date)}</td>
                  <td>{row.description}</td>
                  <td className={`whitespace-nowrap text-right ${row.status === "ok" ? amountColor(row.amount) : ""}`}>
                    € {row.amount.toFixed(2)}
                    {row.status === "pending" || row.status === "open" ? " (in behandeling)" : ""}
                    {FAILED_PAYMENT_LABELS[row.status ?? ""] ? ` (${FAILED_PAYMENT_LABELS[row.status ?? ""]})` : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>
      )}
      <Section title="Mijn persoonlijke gegevens wijzigen">
        <PersonalForm home={home} onSave={save} />
      </Section>
      <Section title="Mijn account verwijderen">
        <button
          className="inline-block cursor-pointer rounded bg-red-700 px-4 py-2.5 font-semibold tracking-wide text-white hover:bg-red-800"
          type="button"
          onClick={() => void removeAccount(router, setError)}
        >
          Account verwijderen
        </button>
      </Section>
    </CitizenShell>
  );
}

function dutchDate(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return `${String(date.getDate()).padStart(2, "0")}-${String(date.getMonth() + 1).padStart(2, "0")}-${date.getFullYear()}`;
}

function dateTime(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return `${dutchDate(value)} ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

const FAILED_PAYMENT_LABELS: Record<string, string> = {
  cancelled: "geannuleerd",
  canceled: "geannuleerd",
  expired: "verlopen",
  failed: "mislukt",
};

function amountColor(amount: number): string {
  if (amount > 0) return "text-green-700";
  if (amount < 0) return "text-red-700";
  return "";
}

function FeedbackText({ feedback }: { feedback: Feedback }) {
  return (
    <div className="mb-3 text-green-800">
      {feedback.map((line, index) => (
        <p key={index} className={`whitespace-pre-line ${line.bold ? "font-bold" : ""}`}>{line.text}</p>
      ))}
    </div>
  );
}

// account.cfm: subscriptions, buurtstallingen & fietstrommels and waiting list, with the processMethods of mypage/controller.cfm.
function MijnAbonnementen({ open, forceShow }: { open: boolean; forceShow: boolean }) {
  const [mine, setMine] = useState<Mine | null>(null);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState<Feedback>([]);
  const [confirmPlace, setConfirmPlace] = useState<string | null>(null);
  const [choice, setChoice] = useState<{ placeId: string; forms: { id: number; name: string | null; price: string | null }[] } | null>(null);
  const [chosenForm, setChosenForm] = useState<number | null>(null);

  async function load() {
    const response = await fetch("/api/account/mijn-abonnementen");
    if (response.ok) setMine(await response.json() as Mine);
  }

  useEffect(() => {
    void load();
  }, []);

  async function act(body: { action: string; placeId?: string; entryId?: string; subscriptionTypeId?: number }) {
    setError("");
    setFeedback([]);
    const response = await fetch("/api/account/mijn-abonnementen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await response.json() as { error?: string; feedback?: Feedback; chooseForm?: { id: number; name: string | null; price: string | null }[] };
    if (!response.ok) {
      setError(data.error ?? "De actie is mislukt");
    } else if (data.chooseForm && body.placeId) {
      setChoice({ placeId: body.placeId, forms: data.chooseForm });
      setChosenForm(null);
      return;
    } else {
      setFeedback(data.feedback ?? []);
    }
    setChoice(null);
    await load();
  }

  if (!mine) return null;
  const { subscriptions, places, waitingList } = mine;
  if (!forceShow && subscriptions.length === 0 && places.length === 0 && waitingList.length === 0) return null;
  const guarded = subscriptions.some((row) => !row.hasPlace);
  const lockers = subscriptions.some((row) => row.hasPlace);
  const cell = "border-b border-gray-200 px-2 py-1 align-top";
  const actionClass = `${buttonClass} mb-[3px] block w-full text-sm`;

  return (
    <Section title="Mijn abonnementen" open={open}>
      {subscriptions.length > 0 && (
        <>
          <h2 className="text-lg font-semibold">
            Abonnementen {guarded ? "bewaakte stallingen" : ""} {guarded && lockers ? "&" : ""} {lockers ? "fietskluizen" : ""}
          </h2>
          <table className="w-full text-sm">
            <thead>
              <tr><th className={`${cell} text-left`}>ID</th><th className={`${cell} text-left`}>Abonnement</th><th className={`${cell} text-left`}>Van</th><th className={`${cell} text-left`}>Tot</th><th className={cell} /></tr>
            </thead>
            <tbody>
              {subscriptions.map((row) => (
                <tr key={row.id}>
                  <td className={cell}>{row.pass}</td>
                  <td className={cell}>{row.title}</td>
                  <td className={`${cell} whitespace-nowrap`}>{row.start}</td>
                  <td className={`${cell} whitespace-nowrap`}>{row.end}</td>
                  <td className={`${cell} w-48`}>
                    {row.actions.map((action) => (
                      <Link
                        key={action.label}
                        className={actionClass}
                        href={action.kind === "prolong"
                          ? `/account/abonnement?${new URLSearchParams({ ...(row.siteId ? { siteId: row.siteId } : {}), prolongId: row.ref }).toString()}`
                          : `/account/abonnement?subscriptionId=${encodeURIComponent(row.ref)}&view=koppelPas&source=mijngegevens`}
                      >
                        {action.label}
                      </Link>
                    ))}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {error && <div className="border border-red-300 bg-red-50 p-3 text-red-800"><strong>{error}</strong></div>}
      {feedback.length > 0 && <FeedbackText feedback={feedback} />}

      {choice && (
        <div className="border border-gray-200 p-3">
          <p className="mb-3">Welk abonnement wilt u hebben?</p>
          {choice.forms.map((form) => (
            <label key={form.id} className="block">
              <input className="mr-2" type="radio" name="subscriptiontypeID" checked={chosenForm === form.id} onChange={() => setChosenForm(form.id)} />
              <strong>{form.name}</strong> - € {Number(form.price ?? 0).toFixed(2)} (incl. BTW)
            </label>
          ))}
          <div className="mt-3 text-right">
            <button
              className={buttonClass}
              type="button"
              onClick={() => {
                if (chosenForm === null) {
                  setError("Kies een abonnementsvorm");
                  return;
                }
                void act({ action: "accept", placeId: choice.placeId, subscriptionTypeId: chosenForm });
              }}
            >
              Verstuur
            </button>
          </div>
        </div>
      )}

      {places.length > 0 && (
        <>
          <h2 className="text-lg font-semibold">Abonnementen buurtstallingen &amp; fietstrommels</h2>
          <table className="w-full text-sm">
            <thead>
              <tr><th className={`${cell} text-left`}>Stalling</th><th className={`${cell} text-left`}>Plaats</th><th className={`${cell} text-left`}>Status</th><th className={`${cell} text-left`}>Vervaldatum</th><th className={cell} /></tr>
            </thead>
            <tbody>
              {places.map((row) => (
                <tr key={row.placeId}>
                  <td className={cell}>{row.stallingTitle}</td>
                  <td className={cell}>{row.sectionTitle}, {row.placeTitle}</td>
                  <td className={cell}>{row.statusLabel}</td>
                  <td className={cell}>{dutchDate(row.expiry)}</td>
                  <td className={`${cell} w-48`}>
                    {row.status === "PROPOSED" && (
                      <>
                        <button className={actionClass} type="button" onClick={() => void act({ action: "accept", placeId: row.placeId })}>Neem voorstel aan</button>
                        <button className={actionClass} type="button" onClick={() => void act({ action: "decline", placeId: row.placeId })}>Sla voorstel af</button>
                      </>
                    )}
                    {row.status === "OCCUPIED" && (
                      <button className={actionClass} type="button" onClick={() => setConfirmPlace(row.placeId)}>Beëindig</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {waitingList.length > 0 && (
        <>
          <h2 className="text-lg font-semibold">Wachtlijst</h2>
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className={`${cell} text-left`}>Stalling</th><th className={`${cell} text-left`}>Type tweewieler</th><th className={`${cell} text-left`}>Voorkeur</th>
                <th className={cell}>Positie</th><th className={`${cell} text-left`}>Sinds</th><th className={cell} />
              </tr>
            </thead>
            <tbody>
              {waitingList.map((entry) => (
                <tr key={entry.id}>
                  <td className={cell}>{entry.stallingTitle}</td>
                  <td className={cell}>{entry.bikeTypes.join(" ")}</td>
                  <td className={`${cell} whitespace-nowrap`}>{entry.qualification}</td>
                  <td className={`${cell} text-center`}>{entry.sequence}</td>
                  <td className={cell}>{dutchDate(entry.since)}</td>
                  <td className={cell}>
                    <button className={`${buttonClass} text-sm`} type="button" onClick={() => void act({ action: "leave", entryId: entry.id })}>Verwijder</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {confirmPlace && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" role="dialog" aria-modal="true" aria-labelledby="confirm-stop-title">
          <div className="w-full max-w-md bg-white p-5 shadow-lg">
            <h3 id="confirm-stop-title" className="mb-3 text-lg font-semibold">Abonnement stopzetten</h3>
            <p className="mb-4">Uw abonnement wordt zo spoedig mogelijk beëindigd (zie uw contractsvoorwaarden). Wilt u doorgaan?</p>
            <div className="flex justify-end gap-2">
              <button
                className={buttonClass}
                type="button"
                onClick={() => {
                  const placeId = confirmPlace;
                  setConfirmPlace(null);
                  void act({ action: "cancel", placeId });
                }}
              >
                Ja
              </button>
              <button className={buttonClass} type="button" onClick={() => setConfirmPlace(null)}>Nee</button>
            </div>
          </div>
        </div>
      )}
    </Section>
  );
}

function VisitTable({ rows }: { rows: Transactions["visits"] }) {
  return (
    <table className="w-full text-sm">
      <thead><tr><th className="text-left">In</th><th className="text-left">Uit</th><th className="text-left">Omschrijving</th><th className="text-right">Bij/af</th></tr></thead>
      <tbody>
        {rows.map((row) => (
          <tr key={`${row.checkin}-${row.title}`}>
            <td className="whitespace-nowrap">{dateTime(row.checkin)}</td>
            <td className="whitespace-nowrap">{dateTime(row.checkout)}</td>
            <td>Stalling in {row.stallingId ? <a className="underline" href={`/?stallingid=${encodeURIComponent(row.stallingId)}`}>{row.title}</a> : row.title}</td>
            <td className={`whitespace-nowrap text-right ${amountColor(row.amount)}`}>€ {row.amount.toFixed(2)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function LoginForm({ email, onSave }: { email: string; onSave: (body: object, ok: string) => Promise<void> }) {
  const [next, setNext] = useState(email);
  const [again, setAgain] = useState(email);
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  return (
    <form className="space-y-3" onSubmit={(event) => {
      event.preventDefault();
      if (next !== again) return;
      if (password && password !== password2) return;
      void onSave({ email: next, ...(password ? { password } : {}) }, "Accountgegevens gewijzigd");
    }}>
      <Field label="E-mail"><input className={inputClass} value={next} onChange={(event) => setNext(event.target.value)} /></Field>
      <Field label="E-mail nogmaals"><input className={inputClass} value={again} onChange={(event) => setAgain(event.target.value)} /></Field>
      <Field label="Wachtwoord"><input className={inputClass} type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></Field>
      <Field label="Wachtwoord nogmaals"><input className={inputClass} type="password" value={password2} onChange={(event) => setPassword2(event.target.value)} /></Field>
      <button className={buttonClass} type="submit">Opslaan</button>
    </form>
  );
}

function PersonalForm({ home, onSave }: { home: Home; onSave: (body: object, ok: string) => Promise<void> }) {
  const [form, setForm] = useState({
    sex: home.sex ?? "",
    firstName: home.firstName ?? "",
    middleName: home.middleName ?? "",
    lastName: home.lastName ?? "",
    address: home.address ?? "",
    addressNr: home.addressNr ?? "",
    zip: home.zip ?? "",
    city: home.city ?? "",
    phone: home.phone ?? "",
    mobile: home.mobile ?? "",
  });
  const set = (key: keyof typeof form) => (event: ChangeEvent<HTMLInputElement>) => setForm({ ...form, [key]: event.target.value });
  return (
    <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void onSave(form, "Persoonlijke gegevens gewijzigd"); }}>
      <div className="flex gap-4">
        <label><input type="radio" name="Sex" value="man" checked={form.sex === "man"} onChange={set("sex")} /> Man</label>
        <label><input type="radio" name="Sex" value="vrouw" checked={form.sex === "vrouw"} onChange={set("sex")} /> Vrouw</label>
      </div>
      <Field label="Voornaam"><input className={inputClass} value={form.firstName} onChange={set("firstName")} /></Field>
      <Field label="Tussenvoegsel"><input className={inputClass} value={form.middleName} onChange={set("middleName")} /></Field>
      <Field label="Achternaam"><input className={inputClass} value={form.lastName} onChange={set("lastName")} /></Field>
      <Field label="Straat"><input className={inputClass} value={form.address} onChange={set("address")} /></Field>
      <Field label="Huisnummer"><input className={inputClass} value={form.addressNr} onChange={set("addressNr")} /></Field>
      <Field label="Postcode"><input className={inputClass} value={form.zip} onChange={set("zip")} /></Field>
      <Field label="Plaats"><input className={inputClass} value={form.city} onChange={set("city")} /></Field>
      <Field label="Telefoon"><input className={inputClass} value={form.phone} onChange={set("phone")} /></Field>
      <Field label="Mobiel"><input className={inputClass} value={form.mobile} onChange={set("mobile")} /></Field>
      <button className={buttonClass} type="submit">Opslaan</button>
    </form>
  );
}

async function addPass(
  pasId: string,
  pasType: "sleutelhanger" | "ovchip",
  siteId: string | null,
  setError: (value: string) => void,
  setMessage: (value: string) => void,
  setPasId: (value: string) => void,
  load: () => Promise<void>,
) {
  setError("");
  const response = await fetch("/api/account/passes", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ pasId, pasType, siteId }),
  });
  const data = await response.json();
  if (!response.ok) {
    setError(data.error ?? "Pas niet toegevoegd");
    return;
  }
  setMessage(data.temporaryCode ? `ID toegevoegd. Tijdelijke code: ${data.temporaryCode}` : "ID toegevoegd");
  setPasId("");
  await load();
}

async function removePass(id: string, setError: (value: string) => void, setMessage: (value: string) => void, load: () => Promise<void>) {
  const response = await fetch("/api/account/passes", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
  const data = await response.json();
  if (!response.ok) {
    setError(data.error ?? "Pas niet verwijderd");
    return;
  }
  setMessage("De pas is verwijderd");
  await load();
}

async function removeAccount(router: ReturnType<typeof useRouter>, setError: (value: string) => void) {
  if (!window.confirm("Account verwijderen?")) return;
  const response = await fetch("/api/account/profile", { method: "DELETE" });
  const data = await response.json();
  if (!response.ok) {
    setError(data.error ?? "Account niet verwijderd");
    return;
  }
  await router.push("/account/login");
}
