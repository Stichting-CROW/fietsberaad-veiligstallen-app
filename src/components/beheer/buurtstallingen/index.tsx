import React, { useEffect, useRef, useState } from "react";
import { BIKE_TYPES } from "~/modules/buurtstallingen/domain/types";

type Facility = {
  id: string;
  title: string | null;
  type: string | null;
  counts: { free: number; reserved: number; proposed: number; occupied: number };
};

type Place = {
  id: string;
  title: string;
  status: string;
  statusLabel: string;
  allowedActions: { status: string; label: string }[];
  holderName: string;
  holder: {
    id: string;
    email: string | null;
    firstName: string | null;
    middleName: string | null;
    lastName: string | null;
    phone: string | null;
    mobile: string | null;
    address: string | null;
    addressNr: string | null;
    zip: string | null;
    city: string | null;
  } | null;
  occupation: { accountId: string; expiryDate: string | null; bikeTypeId: number } | null;
};

type Workspace = {
  engineEnabled: boolean;
  canWrite: boolean;
  stalling: { id: string; title: string | null; type: string | null };
  sections: { id: string; title: string; qualification: string; places: Place[] }[];
  waitingList: { id: string; sequenceNumber: number; qualification: string; holderName: string; email: string | null }[];
  subscriptionTypes: { id: number; name: string | null }[];
};

const BuurtstallingenComponent: React.FC = () => {
  const [tab, setTab] = useState<"buurtstalling" | "fietstrommel" | "verlopen" | "export">("buurtstalling");
  const [facilities, setFacilities] = useState<Facility[]>([]);
  const [engineEnabled, setEngineEnabled] = useState(false);
  const [canWrite, setCanWrite] = useState(false);
  const [selectedId, setSelectedId] = useState<string>("");
  const [workspace, setWorkspace] = useState<Workspace | null>(null);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [matches, setMatches] = useState<{ id: string; name: string; email: string | null }[]>([]);
  const [accountId, setAccountId] = useState("");
  const [bikeTypeId, setBikeTypeId] = useState(1);
  const [qualification, setQualification] = useState("NONE");
  const [subscriptionTypeId, setSubscriptionTypeId] = useState("");
  const [swapA, setSwapA] = useState("");
  const [swapB, setSwapB] = useState("");
  const [canDelete, setCanDelete] = useState(false);
  const [expired, setExpired] = useState<{ placeId: string; placeTitle: string | null; stallingId: string; stallingTitle: string; holderName: string }[]>([]);
  const listRequest = useRef(0);
  const workspaceRequest = useRef(0);

  async function loadList(type: "buurtstalling" | "fietstrommel") {
    const request = ++listRequest.current;
    const response = await fetch(`/api/protected/buurtstallingen?type=${type}`);
    const data = await response.json();
    if (request !== listRequest.current) return;
    if (!response.ok) throw new Error(data.error ?? "Laden mislukt");
    setFacilities(data.facilities);
    setEngineEnabled(data.engineEnabled);
    setCanWrite(data.canWrite);
    setSelectedId(data.facilities[0]?.id ?? "");
  }

  async function loadWorkspace(stallingId: string) {
    if (!stallingId) {
      setWorkspace(null);
      return;
    }
    const request = ++workspaceRequest.current;
    const response = await fetch(`/api/protected/buurtstallingen?stallingId=${stallingId}`);
    const data = await response.json();
    if (request !== workspaceRequest.current) return;
    if (!response.ok) throw new Error(data.error ?? "Laden mislukt");
    setWorkspace(data);
    setCanDelete(Boolean(data.canDelete));
    setSubscriptionTypeId(String(data.subscriptionTypes[0]?.id ?? ""));
  }

  useEffect(() => {
    if (tab === "export") return;
    if (tab === "verlopen") {
      fetch("/api/protected/buurtstallingen?verlopen=1")
        .then((response) => response.json())
        .then((data) => {
          if (data.error) throw new Error(data.error);
          setExpired(data.data ?? []);
          setCanWrite(Boolean(data.canWrite));
          setEngineEnabled(Boolean(data.engineEnabled));
        })
        .catch((err: Error) => setError(err.message));
      return;
    }
    loadList(tab).catch((err: Error) => setError(err.message));
  }, [tab]);

  useEffect(() => {
    if (!selectedId) return;
    loadWorkspace(selectedId).catch((err: Error) => setError(err.message));
  }, [selectedId]);

  async function act(body: Record<string, unknown>) {
    setError("");
    const response = await fetch("/api/protected/buurtstallingen", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stallingId: selectedId, ...body }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Actie mislukt");
      return;
    }
    if (tab === "verlopen") {
      const again = await fetch("/api/protected/buurtstallingen?verlopen=1");
      const againData = await again.json();
      setExpired(againData.data ?? []);
      return;
    }
    await loadWorkspace(selectedId);
    if (tab !== "export") await loadList(tab);
  }

  const writable = canWrite && engineEnabled;

  return (
    <div className="space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Buurtstallingen / fietstrommels</h1>
      {!engineEnabled && (
        <p className="rounded border border-amber-300 bg-amber-50 p-3 text-sm">
          Schrijfacties staan uit. Deze organisatie gebruikt nog de bestaande reserveringsservice.
        </p>
      )}
      {error && <p className="rounded border border-red-300 bg-red-50 p-3 text-sm">{error}</p>}
      <div className="flex gap-2">
        {(["buurtstalling", "fietstrommel", "verlopen", "export"] as const).map((item) => (
          <button key={item} type="button" className={`rounded px-3 py-1 ${tab === item ? "bg-sky-700 text-white" : "bg-white"}`} onClick={() => setTab(item)}>
            {item === "buurtstalling" ? "Buurtstallingen" : item === "fietstrommel" ? "Fietstrommels" : item === "verlopen" ? "Verlopen opzeggingen" : "Export"}
          </button>
        ))}
      </div>
      {tab === "verlopen" ? (
        <ul className="space-y-2 rounded border bg-white p-4">
          {expired.length === 0 && <li>Geen verlopen opzeggingen.</li>}
          {expired.map((row) => (
            <li key={row.placeId} className="flex items-center justify-between gap-3">
              <span>{row.stallingTitle} — {row.placeTitle} — {row.holderName}</span>
              {writable && (
                <button type="button" className="underline" onClick={() => void act({ action: "status", stallingId: row.stallingId, placeId: row.placeId, next: "FREE" })}>
                  Sleutel ingenomen
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : tab === "export" ? (
        <div className="space-y-4 rounded border bg-white p-4">
          <p><a className="text-sky-700 underline" href="/api/protected/buurtstallingen?export=maand">Maandrapport (CSV)</a></p>
          {canWrite && (
            <>
              <p className="font-medium">Wachtlijst</p>
              <p className="flex gap-4">
                <a className="text-sky-700 underline" href="/api/protected/buurtstallingen?export=wachtlijst&type=buurtstalling">Buurtstallingen</a>
                <a className="text-sky-700 underline" href="/api/protected/buurtstallingen?export=wachtlijst&type=fietstrommel">Fietstrommels</a>
              </p>
              <p className="font-medium">Gebruikers</p>
              <p className="flex gap-4">
                <a className="text-sky-700 underline" href="/api/protected/buurtstallingen?export=gebruikers&type=buurtstalling">Buurtstallingen</a>
                <a className="text-sky-700 underline" href="/api/protected/buurtstallingen?export=gebruikers&type=fietstrommel">Fietstrommels</a>
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          <label className="block text-sm">
            Stalling
            <select className="mt-1 block w-full max-w-xl rounded border p-2" value={selectedId} onChange={(event) => setSelectedId(event.target.value)}>
              {facilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.title} — vrij {facility.counts.free}, gereserveerd {facility.counts.reserved}, aangeboden {facility.counts.proposed}, bezet {facility.counts.occupied}
                </option>
              ))}
            </select>
          </label>
          {workspace && (
            <>
              {writable && (
                <form
                  className="grid gap-2 rounded border bg-white p-4 md:grid-cols-4"
                  onSubmit={(event) => {
                    event.preventDefault();
                    void act({
                      action: "reserve",
                      accountId,
                      bikeTypeId,
                      qualification,
                      subscriptionTypeId: subscriptionTypeId || null,
                    });
                  }}
                >
                  <strong className="md:col-span-4">Reserveer voor klant</strong>
                  <input className="rounded border p-2" placeholder="Zoek naam of e-mail" value={query} onChange={(event) => setQuery(event.target.value)} />
                  <button
                    type="button"
                    className="rounded bg-gray-100 px-3"
                    onClick={() => {
                      void fetch(`/api/protected/buurtstallingen?q=${encodeURIComponent(query)}`)
                        .then((response) => response.json())
                        .then((data) => setMatches(data.data ?? []));
                    }}
                  >
                    Zoek
                  </button>
                  <select className="rounded border p-2" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
                    <option value="">Kies klant</option>
                    {matches.map((match) => (
                      <option key={match.id} value={match.id}>{match.name} ({match.email})</option>
                    ))}
                  </select>
                  <select className="rounded border p-2" value={bikeTypeId} onChange={(event) => setBikeTypeId(Number(event.target.value))}>
                    {Object.entries(BIKE_TYPES).map(([id, label]) => (
                      <option key={id} value={id}>{label}</option>
                    ))}
                  </select>
                  <select className="rounded border p-2" value={qualification} onChange={(event) => setQualification(event.target.value)}>
                    <option value="NONE">Onderrek</option>
                    <option value="UNDER">Alleen onder</option>
                    <option value="ABOVE">Alleen boven</option>
                  </select>
                  <select className="rounded border p-2" value={subscriptionTypeId} onChange={(event) => setSubscriptionTypeId(event.target.value)}>
                    {workspace.subscriptionTypes.map((form) => (
                      <option key={form.id} value={form.id}>{form.name}</option>
                    ))}
                  </select>
                  <button className="rounded bg-sky-700 px-3 text-white" type="submit" disabled={!accountId}>Reserveer</button>
                  <button
                    className="rounded border px-3"
                    type="button"
                    disabled={!accountId}
                    onClick={() => void act({ action: "wachtlijst", accountId, bikeTypeId, qualification })}
                  >
                    Op wachtlijst
                  </button>
                </form>
              )}
              {writable && (
                <form className="flex flex-wrap items-end gap-2" onSubmit={(event) => { event.preventDefault(); void act({ action: "swap", placeIdA: swapA, placeIdB: swapB }); }}>
                  <label className="text-sm">Wissel plek
                    <input className="mt-1 block rounded border p-2" placeholder="plek-id" value={swapA} onChange={(event) => setSwapA(event.target.value)} />
                  </label>
                  <label className="text-sm">met
                    <input className="mt-1 block rounded border p-2" placeholder="plek-id" value={swapB} onChange={(event) => setSwapB(event.target.value)} />
                  </label>
                  <button className="rounded border px-3 py-2" type="submit">Wissel</button>
                </form>
              )}
              {workspace.sections.map((section) => (
                <section key={section.id} className="rounded border bg-white">
                  <h2 className="border-b px-4 py-2 font-medium">{section.title} ({section.qualification})</h2>
                  <table className="w-full text-sm">
                    <tbody>
                      {section.places.map((place) => (
                        <tr key={place.id} className="border-t">
                          <td className="px-4 py-2">{place.title}<div className="text-xs text-gray-500">{place.id}</div></td>
                          <td>{place.statusLabel}</td>
                          <td>{place.holderName}</td>
                          <td className="space-x-2 py-2 text-right">
                            {canDelete && engineEnabled && place.status === "FREE" && (
                              <button type="button" className="underline" onClick={() => void act({ action: "delete-place", placeId: place.id })}>Verwijder plek</button>
                            )}
                            {writable && place.allowedActions.map((action) => (
                              <button key={action.status} type="button" className="underline" onClick={() => void act({ action: "status", placeId: place.id, next: action.status })}>
                                {action.label}
                              </button>
                            ))}
                            {place.occupation && place.holder && (
                              <>
                                <a className="underline" href={`/api/protected/buurtstallingen?stallingId=${workspace.stalling.id}&placeId=${place.id}&document=contract`}>Contract</a>
                                <a className="underline" href={`/api/protected/buurtstallingen?stallingId=${workspace.stalling.id}&placeId=${place.id}&document=machtiging`}>Machtiging</a>
                                {writable && (
                                  <details className="inline text-left">
                                    <summary className="cursor-pointer underline">Gegevens</summary>
                                    <form
                                      className="mt-2 grid gap-1 bg-gray-50 p-2 text-left"
                                      onSubmit={(event) => {
                                        event.preventDefault();
                                        const form = new FormData(event.currentTarget);
                                        void act({
                                          action: "houder",
                                          accountId: place.holder?.id,
                                          firstName: form.get("firstName"),
                                          middleName: form.get("middleName"),
                                          lastName: form.get("lastName"),
                                          email: form.get("email"),
                                          phone: form.get("phone"),
                                          mobile: form.get("mobile"),
                                          address: form.get("address"),
                                          addressNr: form.get("addressNr"),
                                          zip: form.get("zip"),
                                          city: form.get("city"),
                                        });
                                      }}
                                    >
                                      <input name="firstName" defaultValue={place.holder.firstName ?? ""} className="rounded border p-1" placeholder="Voornaam" />
                                      <input name="middleName" defaultValue={place.holder.middleName ?? ""} className="rounded border p-1" placeholder="Tussenvoegsel" />
                                      <input name="lastName" defaultValue={place.holder.lastName ?? ""} className="rounded border p-1" placeholder="Achternaam" />
                                      <input name="email" defaultValue={place.holder.email ?? ""} className="rounded border p-1" placeholder="E-mail" />
                                      <input name="phone" defaultValue={place.holder.phone ?? ""} className="rounded border p-1" placeholder="Telefoon" />
                                      <input name="mobile" defaultValue={place.holder.mobile ?? ""} className="rounded border p-1" placeholder="Mobiel" />
                                      <input name="address" defaultValue={place.holder.address ?? ""} className="rounded border p-1" placeholder="Straat" />
                                      <input name="addressNr" defaultValue={place.holder.addressNr ?? ""} className="rounded border p-1" placeholder="Huisnummer" />
                                      <input name="zip" defaultValue={place.holder.zip ?? ""} className="rounded border p-1" placeholder="Postcode" />
                                      <input name="city" defaultValue={place.holder.city ?? ""} className="rounded border p-1" placeholder="Plaats" />
                                      <button className="rounded bg-sky-700 px-2 py-1 text-white" type="submit">Bewaar gegevens</button>
                                    </form>
                                  </details>
                                )}
                              </>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </section>
              ))}
              <section className="rounded border bg-white p-4">
                <h2 className="font-medium">Wachtlijst</h2>
                <ul className="mt-2 space-y-2">
                  {workspace.waitingList.map((entry) => (
                    <li key={entry.id} className="flex items-center justify-between gap-3">
                      <span>{entry.sequenceNumber}. {entry.holderName} ({entry.email}) — {entry.qualification}</span>
                      {writable && (
                        <button type="button" className="underline" onClick={() => void act({ action: "wachtlijst-verwijder", entryId: entry.id })}>Verwijder</button>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </>
      )}
    </div>
  );
};

export default BuurtstallingenComponent;
