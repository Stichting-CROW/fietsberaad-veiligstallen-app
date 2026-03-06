import React, { useState, useEffect } from "react";
import { useBikeTypes } from "~/hooks/useBikeTypes";
import { UNKNOWN_BIKETYPE_ID } from "~/lib/parking-simulation/types";

type ParkedBicycle = {
  id: string;
  bicycleId: string;
  bicycle?: { id: string; barcode: string; biketypeID?: number } | null;
  checkedIn: boolean;
  passID?: string | null;
  createdAt?: string | null;
};

type SectionData = {
  sectionid: string;
  capacity: number;
  occupied: number;
  onbezet: number;
  parkedBicycles: ParkedBicycle[];
};

type Props = {
  locationid: string;
  title?: string;
};

export const StallingSlotOverview: React.FC<Props> = ({ locationid, title }) => {
  const { data: bikeTypes } = useBikeTypes();
  const [sections, setSections] = useState<SectionData[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchData = () => {
    fetch(`/api/protected/parking-simulation/slots/${encodeURIComponent(locationid)}`)
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: { data?: SectionData[] }) => {
        setSections(data.data ?? []);
      })
      .catch(() => setSections([]))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    setLoading(true);
    fetchData();
  }, [locationid]);

  useEffect(() => {
    const handler = () => fetchData();
    window.addEventListener("simulation-clock-updated", handler);
    window.addEventListener("parking-slot-updated", handler);
    return () => {
      window.removeEventListener("simulation-clock-updated", handler);
      window.removeEventListener("parking-slot-updated", handler);
    };
  }, [locationid]);

  const getBikeTypeName = (id: number) => {
    if (id === UNKNOWN_BIKETYPE_ID) return "Onbekend";
    return bikeTypes?.find((t) => t.ID === id)?.Name ?? bikeTypes?.find((t) => t.ID === id)?.naamenkelvoud ?? `Type ${id}`;
  };

  const formatDurationHours = (createdAt: string | null | undefined): string => {
    if (!createdAt) return "—";
    const start = new Date(createdAt).getTime();
    const hours = (Date.now() - start) / (1000 * 60 * 60);
    if (hours < 1) return `${(hours * 60).toFixed(0)} min`;
    return `${hours.toFixed(1)} u`;
  };

  const getParkedBikeTooltip = (p: ParkedBicycle): string => {
    const parts = [
      `Fiets: ${p.bicycle?.barcode ?? p.bicycleId}`,
      `Pas: ${p.passID ?? "—"}`,
      `Type: ${getBikeTypeName(p.bicycle?.biketypeID ?? UNKNOWN_BIKETYPE_ID)}`,
      `Duur: ${formatDurationHours(p.createdAt)}`,
    ];
    return parts.join(" · ");
  };

  const columnIds = React.useMemo(() => {
    const ids = new Set<number>();
    for (const sec of sections) {
      for (const p of sec.parkedBicycles ?? []) {
        ids.add(p.bicycle?.biketypeID ?? UNKNOWN_BIKETYPE_ID);
      }
    }
    return [...ids].sort((a, b) => a - b);
  }, [sections]);

  if (loading) {
    return (
      <div className="text-xs text-gray-500 py-1">Bezetting laden...</div>
    );
  }

  if (sections.length === 0) {
    return (
      <div className="text-xs text-gray-500 py-1">Geen secties voor deze stalling</div>
    );
  }

  return (
    <div className="bg-white border rounded p-2 text-xs">
      {title && <h5 className="font-medium text-gray-700 mb-1.5">{title}</h5>}
      <div className="overflow-x-auto">
        <table className="border-collapse">
          <thead>
            <tr>
              <th className="text-left text-gray-600 pr-2 pb-1 font-normal align-top">Sectie</th>
              {columnIds.map((btId) => (
                <th key={btId} className="text-left text-gray-600 pr-2 pb-1 font-normal align-top">
                  {getBikeTypeName(btId)}
                </th>
              ))}
              <th className="text-left text-gray-600 pr-2 pb-1 font-normal align-top">Onbezet</th>
            </tr>
          </thead>
          <tbody>
            {sections.map((sec) => {
              const byBiketype = (sec.parkedBicycles ?? []).reduce((acc, p) => {
                const btId = p.bicycle?.biketypeID ?? UNKNOWN_BIKETYPE_ID;
                if (!acc[btId]) acc[btId] = [];
                acc[btId].push(p);
                return acc;
              }, {} as Record<number, ParkedBicycle[]>);

              return (
                <tr key={sec.sectionid}>
                  <td className="pr-2 align-top text-gray-700">{sec.sectionid}</td>
                  {columnIds.map((btId) => {
                    const list = byBiketype[btId] ?? [];
                    return (
                      <td key={btId} className="pr-2 align-top">
                        <div className="flex gap-0.5 flex-wrap max-w-[180px]">
                          {list.map((p) => (
                            <span
                              key={p.id}
                              className="inline-block w-2 h-2 rounded-full bg-green-500 cursor-default"
                              title={getParkedBikeTooltip(p)}
                            />
                          ))}
                        </div>
                      </td>
                    );
                  })}
                  <td className="pr-2 align-top">
                    <span
                      className="inline-flex items-center px-2 py-0.5 rounded-full bg-red-100 text-red-800 border border-red-200 text-xs font-medium"
                      title={`${sec.onbezet ?? 0} vrije plekken`}
                    >
                      {sec.onbezet ?? 0}
                    </span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
