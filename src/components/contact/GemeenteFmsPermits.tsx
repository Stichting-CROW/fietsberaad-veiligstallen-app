import React, { useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { FMS_PERMIT_TYPES } from "~/types/fms-permit-types";
import { useDataproviders } from "~/hooks/useDataproviders";
import { useGemeenteFmsPermits } from "~/hooks/useGemeenteFmsPermits";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import type { FmsPermitRow } from "~/server/services/fms/fms-permit-service";

type GemeenteFmsPermitsProps = {
  gemeenteId: string;
  gemeenteName?: string | null;
};

function PermitTypeCheckboxes({
  selected,
  disabled,
  onChange,
}: {
  selected: string[];
  disabled?: boolean;
  onChange: (types: string[]) => void;
}) {
  const toggle = (name: string, checked: boolean) => {
    if (checked) {
      onChange([...new Set([...selected, name])]);
    } else {
      onChange(selected.filter((t) => t !== name));
    }
  };

  return (
    <div className="flex flex-col gap-1 min-w-[12rem]">
      {FMS_PERMIT_TYPES.map((pt) => (
        <label key={pt.name} className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={selected.includes(pt.name)}
            disabled={disabled}
            onChange={(e) => toggle(pt.name, e.target.checked)}
          />
          <span>{pt.label}</span>
        </label>
      ))}
    </div>
  );
}

function PermitRowEditor({
  gemeenteId,
  row,
  canEdit,
  onSaved,
  onError,
}: {
  gemeenteId: string;
  row: FmsPermitRow;
  canEdit: boolean;
  onSaved: () => void;
  onError: (msg: string) => void;
}) {
  const [types, setTypes] = useState<string[]>(row.permitTypes);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const dirty = useMemo(() => {
    const a = [...types].sort().join(",");
    const b = [...row.permitTypes].sort().join(",");
    return a !== b;
  }, [types, row.permitTypes]);

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(
        `/api/protected/gemeenten/${gemeenteId}/fmsservice-permits/${row.id}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ permitTypes: types }),
        }
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Opslaan mislukt");
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Opslaan mislukt");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirm("Dit recht verwijderen?")) return;
    setDeleting(true);
    try {
      const res = await fetch(
        `/api/protected/gemeenten/${gemeenteId}/fmsservice-permits/${row.id}`,
        { method: "DELETE" }
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Verwijderen mislukt");
      onSaved();
    } catch (e) {
      onError(e instanceof Error ? e.message : "Verwijderen mislukt");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <tr className="border-t">
      <td className="py-3 pr-4 align-top">
        <div className="font-medium">{row.operatorName}</div>
        {row.operatorUrlName && (
          <div className="text-xs text-gray-500">{row.operatorUrlName}</div>
        )}
      </td>
      <td className="py-3 pr-4 align-top text-sm">{row.locationLabel}</td>
      <td className="py-3 pr-4 align-top">
        <PermitTypeCheckboxes
          selected={types}
          disabled={!canEdit || saving || deleting}
          onChange={setTypes}
        />
      </td>
      <td className="py-3 align-top">
        {canEdit && (
          <div className="flex flex-col gap-2">
            <button
              type="button"
              className="px-3 py-1 rounded border text-sm disabled:opacity-40"
              disabled={!dirty || saving || deleting}
              onClick={() => void save()}
            >
              {saving ? "Bezig…" : "Opslaan"}
            </button>
            <button
              type="button"
              className="px-3 py-1 rounded border border-red-200 text-red-700 text-sm disabled:opacity-40"
              disabled={saving || deleting}
              onClick={() => void remove()}
            >
              {deleting ? "Bezig…" : "Verwijderen"}
            </button>
          </div>
        )}
      </td>
    </tr>
  );
}

const GemeenteFmsPermits: React.FC<GemeenteFmsPermitsProps> = ({
  gemeenteId,
  gemeenteName,
}) => {
  const { data: session } = useSession();
  const { dataproviders, isLoading: dpLoading } = useDataproviders();
  const { permits, fmsStallings, isLoading, error, reload } =
    useGemeenteFmsPermits(gemeenteId);

  const canEdit = userHasRight(
    session?.user?.securityProfile,
    VSSecurityTopic.fietsberaad_superadmin
  );

  const [newOperatorId, setNewOperatorId] = useState("");
  const [newBikeparkId, setNewBikeparkId] = useState("");
  const [newTypes, setNewTypes] = useState<string[]>(["operator"]);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const activeDataproviders = dataproviders.filter((d) => d.Status === "1");

  const groupedPermits = useMemo(() => {
    const map = new Map<string, FmsPermitRow[]>();
    for (const p of permits) {
      const list = map.get(p.operatorId) ?? [];
      list.push(p);
      map.set(p.operatorId, list);
    }
    return map;
  }, [permits]);

  const createPermit = async () => {
    if (!newOperatorId) {
      setActionError("Kies een dataleverancier");
      return;
    }
    if (newTypes.length === 0) {
      setActionError("Selecteer minimaal één recht");
      return;
    }

    setCreating(true);
    setActionError(null);
    try {
      const res = await fetch(`/api/protected/gemeenten/${gemeenteId}/fmsservice-permits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          operatorId: newOperatorId,
          bikeparkId: newBikeparkId || null,
          permitTypes: newTypes,
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? "Aanmaken mislukt");
      setNewOperatorId("");
      setNewBikeparkId("");
      setNewTypes(["operator"]);
      reload();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "Aanmaken mislukt");
    } finally {
      setCreating(false);
    }
  };

  if (isLoading || dpLoading) {
    return <p className="text-sm text-gray-600 mt-4">FMS-rechten laden…</p>;
  }

  return (
    <div className="mt-4 w-full space-y-6">
      <p className="text-sm text-gray-600">
        Koppel dataleveranciers aan {gemeenteName ?? "deze gemeente"} en geef per locatie
        FMS-rechten. Credentials stel je in via{" "}
        <strong>Beheer → Dataleveranciers</strong> (UrlName + wachtwoord).
      </p>

      {(error || actionError) && (
        <div className="text-red-600 font-medium text-sm">{error ?? actionError}</div>
      )}

      {permits.length === 0 ? (
        <p className="text-sm text-gray-500">Nog geen FMS-rechten voor deze gemeente.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b text-sm text-gray-700">
                <th className="py-2 pr-4">Dataleverancier</th>
                <th className="py-2 pr-4">Locatie</th>
                <th className="py-2 pr-4">Rechten</th>
                <th className="py-2">Acties</th>
              </tr>
            </thead>
            <tbody>
              {[...groupedPermits.entries()].flatMap(([, rows]) =>
                rows.map((row) => (
                  <PermitRowEditor
                    key={row.id}
                    gemeenteId={gemeenteId}
                    row={row}
                    canEdit={canEdit}
                    onSaved={reload}
                    onError={setActionError}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      )}

      {canEdit && (
        <div className="border rounded-lg p-4 space-y-4 bg-gray-50">
          <h3 className="font-semibold text-gray-900">Nieuwe toegang</h3>
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Dataleverancier
              </label>
              <select
                className="border rounded px-3 py-2 w-full"
                value={newOperatorId}
                onChange={(e) => setNewOperatorId(e.target.value)}
              >
                <option value="">— kies —</option>
                {activeDataproviders.map((d) => (
                  <option key={d.ID} value={d.ID}>
                    {d.CompanyName}
                    {d.UrlName ? ` (${d.UrlName})` : ""}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Locatie</label>
              <select
                className="border rounded px-3 py-2 w-full"
                value={newBikeparkId}
                onChange={(e) => setNewBikeparkId(e.target.value)}
              >
                <option value="">
                  Alle stallingen{gemeenteName ? ` in ${gemeenteName}` : ""}
                </option>
                {fmsStallings.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.stallingsId} — {s.title ?? s.id}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <PermitTypeCheckboxes selected={newTypes} onChange={setNewTypes} />
          <button
            type="button"
            className="px-4 py-2 rounded bg-blue-600 text-white text-sm disabled:opacity-50"
            disabled={creating}
            onClick={() => void createPermit()}
          >
            {creating ? "Bezig…" : "Toegang toevoegen"}
          </button>
        </div>
      )}

      {!canEdit && (
        <p className="text-xs text-gray-500">
          Alleen fietsberaad superadmin kan FMS-rechten wijzigen.
        </p>
      )}
    </div>
  );
};

export default GemeenteFmsPermits;
