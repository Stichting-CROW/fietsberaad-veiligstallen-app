import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/router";
import { CitizenShell, buttonClass, inputClass, useCitizenOwner, useSetCitizenOwner } from "~/components/citizen/CitizenShell";
import { LoadingSpinner } from "~/components/beheer/common/LoadingSpinner";
import { safeCitizenLoginNext } from "~/utils/citizen-login-next";

type Council = { id: string; name: string; urlName: string };

let councilsCache: Council[] | null = null;

export default function GemeentePage() {
  const router = useRouter();
  const owner = useCitizenOwner();
  const setOwner = useSetCitizenOwner();
  const [councils, setCouncils] = useState<Council[] | null>(councilsCache);
  const [search, setSearch] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (councilsCache) return;
    void fetch("/api/account/councils")
      .then(async (response) => response.json() as Promise<{ councils: Council[] }>)
      .then((data) => {
        councilsCache = data.councils;
        setCouncils(data.councils);
      })
      .catch(() => setError("De gemeenten konden niet worden geladen."));
  }, []);

  const visible = useMemo(() => {
    const term = search.trim().toLowerCase();
    return (councils ?? []).filter((council) => !term || council.name.toLowerCase().includes(term));
  }, [councils, search]);

  async function choose(council: Council) {
    await setOwner(council);
    const next = safeCitizenLoginNext(router.query.next);
    const url = new URL(next, window.location.origin);
    if (url.searchParams.has("siteId")) url.searchParams.set("siteId", council.id);
    await router.push(`${url.pathname}${url.search}`);
  }

  return (
    <CitizenShell title="Kies gemeente">
      <div className="bg-white p-4">
        {error && <div className="mb-3 border border-red-300 bg-red-50 p-3 text-red-800">{error}</div>}
        <label className="mb-4 block">
          <span className="mb-1 block">Zoek uw gemeente:</span>
          <input
            className={inputClass}
            type="search"
            value={search}
            autoFocus
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        {!councils ? <LoadingSpinner message="" /> : (
          <div className="max-h-[60vh] overflow-y-auto">
            {visible.map((council) => (
              <button
                key={council.id}
                className={`${buttonClass} mb-[5px] block w-full text-left ${council.id === owner ? "bg-[var(--vs-theme2)]" : ""}`}
                type="button"
                onClick={() => void choose(council)}
              >
                {council.name}
              </button>
            ))}
            {visible.length === 0 && <p>Geen gemeente gevonden.</p>}
          </div>
        )}
      </div>
    </CitizenShell>
  );
}
