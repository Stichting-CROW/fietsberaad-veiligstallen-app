import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { ConfirmPopover } from "~/components/ConfirmPopover";
import { LoadingSpinner } from "~/components/beheer/common/LoadingSpinner";
import { useFmsPermitsEditor } from "~/hooks/useFmsPermits";
import {
  FMS_PERMIT_TYPES,
  parsePermitTypes,
} from "~/types/fms-permits";
import { VSSecurityTopic } from "~/types/securityprofile";
import { getSecurityRights } from "~/utils/client/security-profile-tools";

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const sa = [...a].sort();
  const sb = [...b].sort();
  return sa.every((v, i) => v === sb[i]);
}

const GekoppeldeLocaties: React.FC = () => {
  const { data: session } = useSession();
  const siteID = session?.user?.activeContactId ?? "";
  const rights = getSecurityRights(
    session?.user?.securityProfile,
    VSSecurityTopic.fmsservices
  );

  const {
    editorData,
    isLoading,
    error,
    createPermit,
    updatePermit,
    deletePermit,
  } = useFmsPermitsEditor(siteID);

  const [rowDrafts, setRowDrafts] = useState<Record<number, string[]>>({});
  const [savingRowId, setSavingRowId] = useState<number | null>(null);
  const [deleteAnchorEl, setDeleteAnchorEl] = useState<HTMLElement | null>(null);
  const [permitToDelete, setPermitToDelete] = useState<number | null>(null);
  const [statusMessage, setStatusMessage] = useState<{
    type: "success" | "warning" | "error";
    text: string;
  } | null>(null);

  const [newOperatorID, setNewOperatorID] = useState("");
  const [newBikeparkID, setNewBikeparkID] = useState<string>("");
  const [newPermitTypes, setNewPermitTypes] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!editorData?.permits) return;
    const drafts: Record<number, string[]> = {};
    for (const p of editorData.permits) {
      drafts[p.ID] = parsePermitTypes(p.Permit);
    }
    setRowDrafts(drafts);
  }, [editorData?.permits]);

  const showLegacyWarning = useCallback((legacyRefreshed: boolean) => {
    if (!legacyRefreshed) {
      setStatusMessage({
        type: "warning",
        text: "Wijziging opgeslagen, maar de FMS-server kon niet worden ververst. Probeer later opnieuw of ververs handmatig via de legacy beheeromgeving.",
      });
    } else {
      setStatusMessage({
        type: "success",
        text: "Wijziging opgeslagen.",
      });
    }
  }, []);

  const groupedPermits = useMemo(() => {
    if (!editorData?.permits) return [];
    const groups = new Map<string, typeof editorData.permits>();
    for (const p of editorData.permits) {
      const key = p.operatorName ?? p.OperatorID ?? "?";
      const list = groups.get(key) ?? [];
      list.push(p);
      groups.set(key, list);
    }
    return Array.from(groups.entries()).sort(([a], [b]) => a.localeCompare(b, "nl"));
  }, [editorData?.permits]);

  const handleRowCheckbox = (permitId: number, typeName: string, checked: boolean) => {
    setRowDrafts((prev) => {
      const current = prev[permitId] ?? [];
      const next = checked
        ? [...current, typeName]
        : current.filter((t) => t !== typeName);
      return { ...prev, [permitId]: next };
    });
  };

  const handleSaveRow = async (permitId: number) => {
    setSavingRowId(permitId);
    setStatusMessage(null);
    try {
      const { legacyRefreshed } = await updatePermit(
        permitId,
        rowDrafts[permitId] ?? []
      );
      showLegacyWarning(legacyRefreshed);
    } catch (e) {
      setStatusMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Fout bij opslaan",
      });
    } finally {
      setSavingRowId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (permitToDelete == null) return;
    setStatusMessage(null);
    try {
      const { legacyRefreshed } = await deletePermit(permitToDelete);
      showLegacyWarning(legacyRefreshed);
    } catch (e) {
      setStatusMessage({
        type: "error",
        text: e instanceof Error ? e.message : "Fout bij verwijderen",
      });
    } finally {
      setDeleteAnchorEl(null);
      setPermitToDelete(null);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newOperatorID) {
      setStatusMessage({ type: "error", text: "Kies een dataleverancier" });
      return;
    }
    if (!newBikeparkID && newBikeparkID !== "all") {
      setStatusMessage({ type: "error", text: "Kies een locatie" });
      return;
    }

    setCreating(true);
    setStatusMessage(null);
    try {
      const { legacyRefreshed } = await createPermit({
        operatorID: newOperatorID,
        siteID,
        bikeparkID: newBikeparkID === "all" ? null : newBikeparkID,
        permitTypes: newPermitTypes,
      });
      setNewOperatorID("");
      setNewBikeparkID("");
      setNewPermitTypes([]);
      showLegacyWarning(legacyRefreshed);
    } catch (err) {
      setStatusMessage({
        type: "error",
        text: err instanceof Error ? err.message : "Fout bij aanmaken",
      });
    } finally {
      setCreating(false);
    }
  };

  if (!siteID || siteID === "1") {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900">
        Selecteer een gemeente in de bovenbalk om FMS-toegang te beheren.
      </div>
    );
  }

  if (isLoading) {
    return <LoadingSpinner message="FMS-rechten laden..." />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        {error}
      </div>
    );
  }

  const gemeenteName = editorData?.gemeenteName ?? "gemeente";

  return (
    <div className="max-w-5xl">
      <h1 className="mb-2 text-2xl font-semibold text-gray-900">
        Toegang FMS-service — {gemeenteName}
      </h1>
      <p className="mb-6 text-sm text-gray-600">
        Beheer welke dataleveranciers gegevens mogen aanleveren voor stallingen
        in deze gemeente.
      </p>

      {statusMessage && (
        <div
          className={`mb-4 rounded-lg border p-3 text-sm ${
            statusMessage.type === "success"
              ? "border-green-200 bg-green-50 text-green-800"
              : statusMessage.type === "warning"
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-red-200 bg-red-50 text-red-800"
          }`}
        >
          {statusMessage.text}
        </div>
      )}

      {groupedPermits.length === 0 ? (
        <p className="mb-6 text-gray-600">Nog geen toegang ingesteld voor deze gemeente.</p>
      ) : (
        <div className="mb-8 overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="w-10 px-3 py-2" />
                <th className="px-3 py-2 text-left font-medium text-gray-700">
                  Locatie
                </th>
                {FMS_PERMIT_TYPES.map((pt) => (
                  <th
                    key={pt.name}
                    className="px-3 py-2 text-center font-medium text-gray-700"
                    style={{ minWidth: "120px" }}
                  >
                    {pt.label}
                  </th>
                ))}
                <th className="w-24 px-3 py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {groupedPermits.map(([operatorName, permits]) => (
                <React.Fragment key={operatorName}>
                  <tr className="bg-gray-50">
                    <td colSpan={2 + FMS_PERMIT_TYPES.length + 1} className="px-3 py-2">
                      <h3 className="text-left font-semibold text-gray-900">
                        {operatorName}
                      </h3>
                    </td>
                  </tr>
                  {permits.map((p) => {
                    const draft = rowDrafts[p.ID] ?? parsePermitTypes(p.Permit);
                    const original = parsePermitTypes(p.Permit);
                    const isDirty = !arraysEqual(draft, original);
                    const canSave = rights.update && isDirty;

                    return (
                      <tr key={p.ID} className="hover:bg-gray-50/50">
                        <td className="px-3 py-2 align-middle">
                          {rights.delete && (
                            <button
                              type="button"
                              title="Verwijderen"
                              className="rounded p-1 text-red-600 hover:bg-red-50"
                              onClick={(e) => {
                                setDeleteAnchorEl(e.currentTarget);
                                setPermitToDelete(p.ID);
                              }}
                            >
                              ✕
                            </button>
                          )}
                        </td>
                        <td className="px-3 py-2 align-middle text-gray-800">
                          {p.locationLabel}
                        </td>
                        {FMS_PERMIT_TYPES.map((pt) => (
                          <td key={pt.name} className="px-3 py-2 text-center align-middle">
                            <input
                              type="checkbox"
                              checked={draft.includes(pt.name)}
                              disabled={!rights.update}
                              onChange={(e) =>
                                handleRowCheckbox(p.ID, pt.name, e.target.checked)
                              }
                              aria-label={`${pt.label} voor ${p.locationLabel}`}
                            />
                          </td>
                        ))}
                        <td className="px-3 py-2 align-middle">
                          {canSave && (
                            <button
                              type="button"
                              className="rounded border border-sky-600 bg-white px-2 py-1 text-xs text-sky-700 hover:bg-sky-50 disabled:opacity-50"
                              disabled={savingRowId === p.ID}
                              onClick={() => void handleSaveRow(p.ID)}
                            >
                              {savingRowId === p.ID ? "..." : "Opslaan"}
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {rights.create && (
        <section className="rounded-lg border border-gray-200 bg-white p-4">
          <h2 className="mb-4 text-lg font-medium text-gray-900">Nieuwe toegang</h2>
          <form onSubmit={(e) => void handleCreate(e)} className="space-y-4">
            <div className="flex flex-wrap gap-4">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700">Dataleverancier</span>
                <select
                  className="min-w-[200px] rounded border border-gray-300 px-2 py-1.5"
                  value={newOperatorID}
                  onChange={(e) => setNewOperatorID(e.target.value)}
                  required
                >
                  <option value="">— kies —</option>
                  {(editorData?.dataproviders ?? []).map((dp) => (
                    <option key={dp.ID} value={dp.ID}>
                      {dp.CompanyName}
                    </option>
                  ))}
                </select>
              </label>

              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium text-gray-700">Locatie</span>
                <select
                  className="min-w-[280px] rounded border border-gray-300 px-2 py-1.5"
                  value={newBikeparkID}
                  onChange={(e) => setNewBikeparkID(e.target.value)}
                  required
                >
                  <option value="">— kies —</option>
                  <option value="all">
                    Alle locaties gemeente {gemeenteName}
                  </option>
                  {(editorData?.fmsBikeparks ?? []).map((bp) => (
                    <option key={bp.ID} value={bp.ID}>
                      {bp.StallingsID} - {bp.Title}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-gray-700">Rechten</legend>
              {FMS_PERMIT_TYPES.map((pt) => (
                <label key={pt.name} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={newPermitTypes.includes(pt.name)}
                    onChange={(e) => {
                      setNewPermitTypes((prev) =>
                        e.target.checked
                          ? [...prev, pt.name]
                          : prev.filter((t) => t !== pt.name)
                      );
                    }}
                  />
                  {pt.label}
                </label>
              ))}
            </fieldset>

            <button
              type="submit"
              disabled={creating}
              className="rounded bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-50"
            >
              {creating ? "Opslaan..." : "Opslaan"}
            </button>
          </form>
        </section>
      )}

      <ConfirmPopover
        open={Boolean(deleteAnchorEl)}
        anchorEl={deleteAnchorEl}
        onClose={() => {
          setDeleteAnchorEl(null);
          setPermitToDelete(null);
        }}
        onConfirm={() => void handleDeleteConfirm()}
        title="Toegang verwijderen"
        message="Weet u zeker dat u deze toegang wilt verwijderen?"
        confirmText="Verwijderen"
      />
    </div>
  );
};

export default GekoppeldeLocaties;
