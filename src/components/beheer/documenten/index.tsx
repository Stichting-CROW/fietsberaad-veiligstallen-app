import React, { useEffect, useState } from "react";
import { DOCUMENT_PLACEHOLDERS } from "~/modules/buurtstallingen/domain/documents";

type Template = { ID: string; name: string | null };

const DocumentenComponent: React.FC = () => {
  const [templates, setTemplates] = useState<Template[]>([]);
  const [standard, setStandard] = useState<Template[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [name, setName] = useState("");
  const [html, setHtml] = useState("");
  const [error, setError] = useState("");

  async function reload() {
    const response = await fetch("/api/protected/documenttemplates?lists=1");
    const data = await response.json();
    if (!response.ok) throw new Error(data.error ?? "Laden mislukt");
    setTemplates(data.data ?? []);
    setStandard(data.standard ?? []);
  }

  useEffect(() => {
    reload().catch((err: Error) => setError(err.message));
  }, []);

  async function openTemplate(id: string) {
    const response = await fetch(`/api/protected/documenttemplates/${id}`);
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Openen mislukt");
      return;
    }
    setSelectedId(data.ID);
    setName(data.name ?? "");
    setHtml(data.html ?? "");
  }

  async function save() {
    setError("");
    const response = await fetch(selectedId ? `/api/protected/documenttemplates/${selectedId}` : "/api/protected/documenttemplates", {
      method: selectedId ? "PUT" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, html }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Opslaan mislukt");
      return;
    }
    setSelectedId(data.ID);
    await reload();
  }

  async function remove() {
    if (!selectedId) return;
    const response = await fetch(`/api/protected/documenttemplates/${selectedId}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      setError(data.error ?? "Verwijderen mislukt");
      return;
    }
    setSelectedId("");
    setName("");
    setHtml("");
    await reload();
  }

  async function copyFrom(id: string) {
    const response = await fetch("/api/protected/documenttemplates", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ copyFrom: id }),
    });
    const data = await response.json();
    if (!response.ok) {
      setError(data.error ?? "Kopiëren mislukt");
      return;
    }
    await reload();
    await openTemplate(data.ID);
  }

  return (
    <div className="grid gap-4 p-6 lg:grid-cols-[280px_1fr]">
      <aside className="space-y-4">
        <h1 className="text-2xl font-semibold">Documenten</h1>
        {error && <p className="text-sm text-red-700">{error}</p>}
        <button type="button" className="rounded bg-sky-700 px-3 py-1 text-white" onClick={() => { setSelectedId(""); setName("Nieuw document"); setHtml(""); }}>Nieuw document</button>
        <ul>
          {templates.map((template) => (
            <li key={template.ID}>
              <button type="button" className="text-left underline" onClick={() => void openTemplate(template.ID)}>{template.name}</button>
            </li>
          ))}
        </ul>
        {standard.length > 0 && (
          <>
            <h2 className="font-medium">Standaarddocumenten Fietsberaad</h2>
            <ul>
              {standard.map((template) => (
                <li key={template.ID} className="flex justify-between gap-2">
                  <span>{template.name}</span>
                  <button type="button" className="underline" onClick={() => void copyFrom(template.ID)}>Kopieer</button>
                </li>
              ))}
            </ul>
          </>
        )}
      </aside>
      <form className="space-y-3" onSubmit={(event) => { event.preventDefault(); void save(); }}>
        <input className="w-full rounded border p-2" value={name} onChange={(event) => setName(event.target.value)} placeholder="Naam" />
        <div className="flex flex-wrap gap-2">
          {DOCUMENT_PLACEHOLDERS.map((token) => (
            <button key={token} type="button" className="rounded bg-gray-100 px-2 py-1 text-xs" onClick={() => setHtml((current) => `${current}${token}`)}>{token}</button>
          ))}
        </div>
        <textarea className="h-[28rem] w-full rounded border p-2 font-mono text-sm" value={html} onChange={(event) => setHtml(event.target.value)} />
        <div className="flex gap-2">
          <button className="rounded bg-sky-700 px-3 py-1 text-white" type="submit">Opslaan</button>
          {selectedId && <button className="rounded border px-3 py-1" type="button" onClick={() => void remove()}>Verwijder</button>}
        </div>
      </form>
    </div>
  );
};

export default DocumentenComponent;
