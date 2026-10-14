import React, { useEffect, useState } from "react";

type AccountRow = { id: string; email: string | null; firstName: string | null; lastName: string | null; city: string | null; saldo: number };
type SaldoRow = AccountRow & { passes: Array<{ pasId: string; type: string | null }> };
type ProductRow = { id: number; titel: string | null; omschrijving: string | null; prijs: number; credit: number; status: string | null };
type SubscriptionRow = {
  id: number;
  email: string;
  name: string;
  start: string | null;
  end: string | null;
  price: number;
  active: boolean;
  paid: boolean;
  accountId: string | null;
  formId: number | null;
  passId: string | null;
  pass: string;
  barcode: string | null;
};
type FormOption = { ID: number; naam: string | null };

const inputClass = "rounded border px-2 py-1";
const buttonClass = "rounded border px-3 py-1";

function dateInput(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 10);
}

function displayDate(value: string | null): string {
  return value ? new Date(value).toLocaleDateString("nl-NL") : "";
}

async function sendJson(url: string, method: string, body: object) {
  const response = await fetch(url, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, data };
}

type Props = { mode?: "gemeente" | "producten" };

const AccountsComponent: React.FC<Props> = ({ mode = "gemeente" }) => {
  const [tab, setTab] = useState<"accounts" | "saldo" | "abonnementen">("accounts");
  const [message, setMessage] = useState("");

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">{mode === "producten" ? "Producten" : "Accounts en abonnementen"}</h1>
      {mode === "gemeente" && (
        <div className="flex gap-2">
          <button type="button" className={buttonClass} onClick={() => { setTab("accounts"); setMessage(""); }}>Accounts</button>
          <button type="button" className={buttonClass} onClick={() => { setTab("saldo"); setMessage(""); }}>Saldo</button>
          <button type="button" className={buttonClass} onClick={() => { setTab("abonnementen"); setMessage(""); }}>Abonnementen</button>
        </div>
      )}
      {message && <p role="status">{message}</p>}
      {mode === "producten" && <ProductsTab onMessage={setMessage} />}
      {mode === "gemeente" && tab === "accounts" && <AccountsTab onMessage={setMessage} />}
      {mode === "gemeente" && tab === "saldo" && <SaldoTab onMessage={setMessage} />}
      {mode === "gemeente" && tab === "abonnementen" && <SubscriptionsTab onMessage={setMessage} />}
    </div>
  );
};

const AccountsTab: React.FC<{ onMessage: (message: string) => void }> = ({ onMessage }) => {
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [selected, setSelected] = useState<AccountRow | null>(null);
  const [pasId, setPasId] = useState("");
  const [pasType, setPasType] = useState<"sleutelhanger" | "ovchip">("sleutelhanger");
  const [amount, setAmount] = useState("");

  async function loadAccounts(creditors = false) {
    const response = await fetch(`/api/protected/citizen-accounts?q=${encodeURIComponent(query)}${creditors ? "&creditors=1" : ""}`);
    const data = await response.json();
    if (!response.ok) {
      onMessage(data.error ?? "Zoeken mislukt");
      return;
    }
    setAccounts(data.data ?? []);
    onMessage("");
  }

  async function accountAction(action: string, body: object, done: string) {
    const { ok, data } = await sendJson("/api/protected/citizen-accounts", "POST", { action, ...body });
    onMessage(ok ? done : data.error ?? "Mislukt");
    return ok;
  }

  async function saveAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selected) return;
    const form = new FormData(event.currentTarget);
    await accountAction("update", {
      accountId: selected.id,
      email: String(form.get("email") ?? ""),
      firstName: String(form.get("firstName") ?? ""),
      lastName: String(form.get("lastName") ?? ""),
      city: String(form.get("city") ?? ""),
    }, "Account opgeslagen");
  }

  async function createAccount(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const ok = await accountAction("create", {
      email: String(form.get("email") ?? ""),
      firstName: String(form.get("firstName") ?? ""),
      lastName: String(form.get("lastName") ?? ""),
    }, "Account aangemaakt. De burger krijgt een mail met een link om een wachtwoord te kiezen.");
    if (ok) target.reset();
  }

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-2" onSubmit={(event) => { event.preventDefault(); void loadAccounts(false); }}>
        <input className={inputClass} placeholder="Zoek e-mail of naam" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button className={buttonClass} type="submit">Zoek</button>
        <button className={buttonClass} type="button" onClick={() => void loadAccounts(true)}>Crediteuren</button>
      </form>
      <ul className="space-y-1">
        {accounts.map((row) => (
          <li key={row.id}>
            <button type="button" className="underline" onClick={() => setSelected(row)}>
              {row.lastName}, {row.firstName} — {row.email} — € {row.saldo.toFixed(2)}
            </button>
          </li>
        ))}
      </ul>
      {selected && (
        <div className="grid max-w-lg gap-2" key={selected.id}>
          <form className="grid gap-2" onSubmit={(event) => void saveAccount(event)}>
            <h2 className="font-semibold">Account {selected.email}</h2>
            <input className={inputClass} name="email" defaultValue={selected.email ?? ""} aria-label="E-mail" />
            <input className={inputClass} name="firstName" defaultValue={selected.firstName ?? ""} aria-label="Voornaam" />
            <input className={inputClass} name="lastName" defaultValue={selected.lastName ?? ""} aria-label="Achternaam" />
            <input className={inputClass} name="city" defaultValue={selected.city ?? ""} aria-label="Plaats" />
            <button className="rounded bg-sky-800 px-3 py-1 text-white" type="submit">Opslaan</button>
          </form>
          <button type="button" className="text-left underline" onClick={() => void accountAction("reset", { accountId: selected.id }, "Wachtwoordlink verstuurd")}>
            Wachtwoordlink sturen
          </button>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">Pasnummer
              <input className={`${inputClass} block`} value={pasId} onChange={(event) => setPasId(event.target.value)} />
            </label>
            <select className={inputClass} value={pasType} onChange={(event) => setPasType(event.target.value === "ovchip" ? "ovchip" : "sleutelhanger")} aria-label="Pastype">
              <option value="sleutelhanger">Sleutelhanger</option>
              <option value="ovchip">OV-chipkaart</option>
            </select>
            <button type="button" className={buttonClass} onClick={() => void accountAction("pass", { accountId: selected.id, pasId, pasType }, "Pas gekoppeld")}>
              Pas koppelen
            </button>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">Restitutie (€)
              <input className={`${inputClass} block`} type="number" step="0.01" value={amount} onChange={(event) => setAmount(event.target.value)} />
            </label>
            <button type="button" className={buttonClass} onClick={() => void accountAction("restitutie", { accountId: selected.id, amount: Number(amount) }, "Saldo gerestitueerd")}>
              Saldo restitueren
            </button>
          </div>
          <button
            type="button"
            className="text-left text-red-700 underline"
            onClick={() => {
              if (!window.confirm(`Account ${selected.email ?? ""} verwijderen?`)) return;
              void accountAction("delete", { accountId: selected.id }, "Account verwijderd").then((ok) => {
                if (ok) {
                  setAccounts((rows) => rows.filter((row) => row.id !== selected.id));
                  setSelected(null);
                }
              });
            }}
          >
            Account verwijderen
          </button>
        </div>
      )}
      <form className="grid max-w-lg gap-2" onSubmit={(event) => void createAccount(event)}>
        <h2 className="font-semibold">Nieuw account</h2>
        <input className={inputClass} name="email" type="email" placeholder="E-mail" required />
        <input className={inputClass} name="firstName" placeholder="Voornaam" />
        <input className={inputClass} name="lastName" placeholder="Achternaam" />
        <button className={buttonClass} type="submit">Aanmaken</button>
      </form>
    </div>
  );
};

const SaldoTab: React.FC<{ onMessage: (message: string) => void }> = ({ onMessage }) => {
  const [query, setQuery] = useState("");
  const [rows, setRows] = useState<SaldoRow[] | null>(null);

  async function search(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const response = await fetch(`/api/protected/citizen-accounts?saldo=1&q=${encodeURIComponent(query)}`);
    const data = await response.json();
    if (!response.ok) {
      onMessage(data.error ?? "Zoeken mislukt");
      return;
    }
    setRows(data.data ?? []);
    onMessage("");
  }

  return (
    <div className="space-y-4">
      <form className="flex flex-wrap gap-2" onSubmit={(event) => void search(event)}>
        <input className={inputClass} placeholder="E-mailadres of pasnummer" value={query} onChange={(event) => setQuery(event.target.value)} />
        <button className={buttonClass} type="submit">Zoek</button>
      </form>
      {rows && rows.length === 0 && <p>Geen accounts gevonden.</p>}
      {rows && rows.length > 0 && (
        <table className="w-full text-sm">
          <thead>
            <tr><th className="text-left">E-mail</th><th className="text-left">Naam</th><th className="text-left">Passen</th><th className="text-right">Saldo</th></tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td>{row.email}</td>
                <td>{[row.firstName, row.lastName].filter(Boolean).join(" ")}</td>
                <td>{row.passes.map((pass) => pass.pasId).join(", ")}</td>
                <td className="text-right">€ {row.saldo.toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
};

const SubscriptionsTab: React.FC<{ onMessage: (message: string) => void }> = ({ onMessage }) => {
  const [subscriptions, setSubscriptions] = useState<SubscriptionRow[]>([]);
  const [forms, setForms] = useState<FormOption[]>([]);
  const [editing, setEditing] = useState<SubscriptionRow | null>(null);

  async function loadSubscriptions() {
    const response = await fetch("/api/protected/abonnementen-records");
    const data = await response.json();
    if (!response.ok) onMessage(data.error ?? "Laden mislukt");
    setSubscriptions(data.data ?? []);
  }

  useEffect(() => {
    void loadSubscriptions();
    void fetch("/api/protected/abonnementsvormen")
      .then((response) => response.json())
      .then((data: { data?: FormOption[] }) => setForms(data.data ?? []))
      .catch(() => setForms([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function createSubscription(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const { ok, data } = await sendJson("/api/protected/abonnementen-records", "POST", {
      accountId: String(form.get("accountId") ?? ""),
      formId: Number(form.get("formId")),
      start: String(form.get("start") ?? ""),
      end: String(form.get("end") ?? ""),
      cost: String(form.get("cost") ?? ""),
      passNumber: String(form.get("passNumber") ?? ""),
      barcode: String(form.get("barcode") ?? ""),
      count: Number(form.get("count") || 1),
    });
    const created = Array.isArray(data.ids) ? data.ids.length : 0;
    onMessage(ok ? `${created} abonnement(en) aangemaakt` : data.error ?? "Abonnement niet opgeslagen");
    if (ok) {
      target.reset();
      await loadSubscriptions();
    }
  }

  async function updateSubscription(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editing) return;
    const form = new FormData(event.currentTarget);
    const choice = String(form.get("bikepass") ?? "keep");
    const { ok, data } = await sendJson("/api/protected/abonnementen-records", "PUT", {
      id: editing.id,
      start: String(form.get("start") ?? ""),
      end: String(form.get("end") ?? ""),
      extraCost: String(form.get("extraCost") ?? ""),
      bikepass: choice === "keep" ? editing.passId ?? "" : choice,
    });
    onMessage(ok ? "Abonnement opgeslagen" : data.error ?? "Abonnement niet opgeslagen");
    if (ok) {
      setEditing(null);
      await loadSubscriptions();
    }
  }

  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <thead>
          <tr>
            <th className="text-left">Abonnement</th><th className="text-left">Account</th><th className="text-left">Pas</th>
            <th>Van</th><th>Tot</th><th className="text-right">Prijs</th><th>Betaald</th><th />
          </tr>
        </thead>
        <tbody>
          {subscriptions.map((row) => (
            <tr key={row.id}>
              <td>{row.name}</td>
              <td>{row.email}</td>
              <td>{row.pass || (row.barcode ? `barcode ${row.barcode}` : "")}</td>
              <td>{displayDate(row.start)}</td>
              <td>{displayDate(row.end)}</td>
              <td className="text-right">{row.price.toFixed(2)}</td>
              <td className="text-center">{row.paid ? "ja" : "nee"}</td>
              <td><button type="button" className="underline" onClick={() => setEditing(row)}>Wijzig</button></td>
            </tr>
          ))}
        </tbody>
      </table>

      {editing && (
        <form className="grid max-w-lg gap-2" key={editing.id} onSubmit={(event) => void updateSubscription(event)}>
          <h2 className="font-semibold">Abonnement {editing.name} ({editing.email})</h2>
          <label className="text-sm">Aanvangsdatum
            <input className={`${inputClass} block`} name="start" type="date" defaultValue={dateInput(editing.start)} required />
          </label>
          <label className="text-sm">Afloopdatum
            <input className={`${inputClass} block`} name="end" type="date" defaultValue={dateInput(editing.end)} required />
          </label>
          <label className="text-sm">Extra kosten (€, negatief voor restitutie)
            <input className={`${inputClass} block`} name="extraCost" type="number" step="0.01" />
          </label>
          <label className="text-sm">Pas
            <select className={`${inputClass} block`} name="bikepass" defaultValue="keep">
              <option value="keep">{editing.pass ? `Huidige pas houden (${editing.pass})` : "Geen pas"}</option>
              <option value="">Pas ontkoppelen</option>
              <option value="new_temp_pass">Nieuwe tijdelijke pas</option>
            </select>
          </label>
          <div className="flex gap-2">
            <button className="rounded bg-sky-800 px-3 py-1 text-white" type="submit">Opslaan</button>
            <button className={buttonClass} type="button" onClick={() => setEditing(null)}>Annuleren</button>
          </div>
        </form>
      )}

      <form className="grid max-w-lg gap-2" onSubmit={(event) => void createSubscription(event)}>
        <h2 className="font-semibold">Abonnement aanmaken</h2>
        <label className="text-sm">Abonnementsvorm
          <select className={`${inputClass} block`} name="formId" required>
            {forms.map((form) => <option key={form.ID} value={form.ID}>{form.naam ?? form.ID}</option>)}
          </select>
        </label>
        <label className="text-sm">Account-id (leeg met pasnummer: systeemaccount op de pas)
          <input className={`${inputClass} block`} name="accountId" />
        </label>
        <label className="text-sm">Aanvangsdatum
          <input className={`${inputClass} block`} name="start" type="date" required />
        </label>
        <label className="text-sm">Afloopdatum
          <input className={`${inputClass} block`} name="end" type="date" required />
        </label>
        <label className="text-sm">Kosten (€, leeg: prijs van de abonnementsvorm)
          <input className={`${inputClass} block`} name="cost" type="number" step="0.01" />
        </label>
        <label className="text-sm">Pasnummer (eerste van de reeks)
          <input className={`${inputClass} block`} name="passNumber" />
        </label>
        <label className="text-sm">Barcode (zonder pasnummer, max. 12 tekens)
          <input className={`${inputClass} block`} name="barcode" maxLength={12} />
        </label>
        <label className="text-sm">Aantal (max. 10)
          <input className={`${inputClass} block`} name="count" type="number" min={1} max={10} defaultValue={1} />
        </label>
        <button className={buttonClass} type="submit">Aanmaken</button>
      </form>
    </div>
  );
};

const ProductsTab: React.FC<{ onMessage: (message: string) => void }> = ({ onMessage }) => {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [editing, setEditing] = useState<ProductRow | null>(null);

  async function loadProducts() {
    const response = await fetch("/api/protected/producten");
    const data = await response.json();
    if (!response.ok) onMessage(data.error ?? "Laden mislukt");
    setProducts(data.data ?? []);
  }

  useEffect(() => {
    void loadProducts();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveProduct(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const target = event.currentTarget;
    const form = new FormData(target);
    const { ok, data } = await sendJson("/api/protected/producten", "POST", {
      id: editing?.id,
      titel: String(form.get("titel") ?? ""),
      omschrijving: String(form.get("omschrijving") ?? ""),
      prijs: Number(form.get("prijs")),
      credit: Number(form.get("credit")),
      status: String(form.get("status") ?? "1"),
    });
    onMessage(ok ? "Product opgeslagen" : data.error ?? "Product niet opgeslagen");
    if (ok) {
      setEditing(null);
      target.reset();
      await loadProducts();
    }
  }

  async function deleteProduct(product: ProductRow) {
    if (!window.confirm(`Product ${product.titel ?? product.id} verwijderen?`)) return;
    const { ok, data } = await sendJson("/api/protected/producten", "DELETE", { id: product.id });
    onMessage(ok ? "Product verwijderd" : data.error ?? "Product niet verwijderd");
    if (ok) {
      if (editing?.id === product.id) setEditing(null);
      await loadProducts();
    }
  }

  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <thead>
          <tr><th className="text-left">Titel</th><th className="text-right">Prijs</th><th className="text-right">Tegoed</th><th>Status</th><th /></tr>
        </thead>
        <tbody>
          {products.map((product) => (
            <tr key={product.id}>
              <td>{product.titel}</td>
              <td className="text-right">{product.prijs.toFixed(2)}</td>
              <td className="text-right">{product.credit.toFixed(2)}</td>
              <td className="text-center">{product.status === "1" ? "actief" : "inactief"}</td>
              <td className="space-x-2">
                <button type="button" className="underline" onClick={() => setEditing(product)}>Wijzig</button>
                <button type="button" className="text-red-700 underline" onClick={() => void deleteProduct(product)}>Verwijder</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form className="grid max-w-lg gap-2" key={editing?.id ?? "new"} onSubmit={(event) => void saveProduct(event)}>
        <h2 className="font-semibold">{editing ? `Product ${editing.titel ?? editing.id} wijzigen` : "Nieuw product"}</h2>
        <input className={inputClass} name="titel" placeholder="Titel" defaultValue={editing?.titel ?? ""} required />
        <textarea className={inputClass} name="omschrijving" placeholder="Omschrijving" defaultValue={editing?.omschrijving ?? ""} />
        <input className={inputClass} name="prijs" type="number" step="0.01" placeholder="Prijs" defaultValue={editing?.prijs ?? ""} required />
        <input className={inputClass} name="credit" type="number" step="0.01" placeholder="Tegoed" defaultValue={editing?.credit ?? ""} required />
        <select className={inputClass} name="status" defaultValue={editing?.status ?? "1"} aria-label="Status">
          <option value="1">Actief</option>
          <option value="0">Inactief</option>
        </select>
        <div className="flex gap-2">
          <button className={buttonClass} type="submit">Opslaan</button>
          {editing && <button className={buttonClass} type="button" onClick={() => setEditing(null)}>Annuleren</button>}
        </div>
      </form>
    </div>
  );
};

export default AccountsComponent;
