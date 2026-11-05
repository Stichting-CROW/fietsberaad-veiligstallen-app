import React, { useMemo } from "react";
import { LoadingSpinner } from "~/components/beheer/common/LoadingSpinner";
import { useDataproviderFmsPermits } from "~/hooks/useDataproviderFmsPermits";
import { FMS_PERMIT_TYPES, permitTypeIsChecked } from "~/types/fms-permits";
import type { FmsPermitRow } from "~/server/services/fms/fms-permit-service";

type DataproviderLinkedStallingsProps = {
  operatorId: string;
};

function ReadonlyPermitCheckbox({
  checked,
  label,
}: {
  checked: boolean;
  label: string;
}) {
  return (
    <span
      className={`inline-flex h-[1.125rem] w-[1.125rem] items-center justify-center rounded border text-sm font-bold leading-none ${
        checked
          ? "border-gray-600 bg-white text-gray-900"
          : "border-gray-300 bg-gray-50 text-transparent"
      }`}
      role="img"
      aria-label={checked ? `${label}: toegewezen` : `${label}: niet toegewezen`}
    >
      {checked ? "✓" : ""}
    </span>
  );
}

const DataproviderLinkedStallings: React.FC<DataproviderLinkedStallingsProps> = ({
  operatorId,
}) => {
  const { permits, isLoading, error } = useDataproviderFmsPermits(operatorId);

  const groupedByGemeente = useMemo(() => {
    const groups = new Map<string, { gemeenteName: string; rows: FmsPermitRow[] }>();
    for (const p of permits) {
      const key = p.siteId || "?";
      const entry = groups.get(key) ?? { gemeenteName: p.gemeenteName ?? key, rows: [] };
      entry.rows.push(p);
      groups.set(key, entry);
    }
    return Array.from(groups.values())
      .map((g) => ({
        ...g,
        rows: g.rows.sort((a, b) => a.locationLabel.localeCompare(b.locationLabel, "nl")),
      }))
      .sort((a, b) => a.gemeenteName.localeCompare(b.gemeenteName, "nl"));
  }, [permits]);

  const colSpan = 1 + FMS_PERMIT_TYPES.length;

  return (
    <section className="mt-10 max-w-5xl">
      <h2 className="mb-2 text-lg font-medium text-gray-900">Toegewezen stallingen</h2>
      <p className="mb-6 text-sm text-gray-600">
        Dataleverancies hebben standaard geen toegang tot data. Deze rechten worden toegewezen
        via het scherm Toegang FMS Service in de instellingen van de betreffende gemeente
      </p>

      {isLoading && <LoadingSpinner message="Gekoppelde stallingen laden..." />}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">{error}</div>
      )}

      {!isLoading && !error && groupedByGemeente.length === 0 && (
        <p className="font-bold text-gray-800">
          Er zijn nog geen stallingen toegewezen voor deze dataleverancier
        </p>
      )}

      {!isLoading && !error && groupedByGemeente.length > 0 && (
        <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white">
          <table className="min-w-full divide-y divide-gray-200 text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-3 py-2 text-left font-medium text-gray-700">Locatie</th>
                {FMS_PERMIT_TYPES.map((pt) => (
                  <th
                    key={pt.name}
                    className="px-3 py-2 text-center font-medium text-gray-700"
                    style={{ minWidth: "120px" }}
                  >
                    {pt.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {groupedByGemeente.map((group) => (
                <React.Fragment key={group.rows[0]?.siteId ?? group.gemeenteName}>
                  <tr className="bg-gray-50">
                    <td colSpan={colSpan} className="px-3 py-2">
                      <h3 className="text-left font-semibold text-gray-900">
                        {group.gemeenteName}
                      </h3>
                    </td>
                  </tr>
                  {group.rows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50/50">
                      <td className="px-3 py-2 align-middle text-gray-800">
                        {row.locationLabel}
                      </td>
                      {FMS_PERMIT_TYPES.map((pt) => {
                        const assigned = permitTypeIsChecked(row.permit, pt.name);
                        return (
                          <td key={pt.name} className="px-3 py-2 text-center align-middle">
                            <ReadonlyPermitCheckbox checked={assigned} label={pt.label} />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </React.Fragment>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
};

export default DataproviderLinkedStallings;
