import React, { useState, useMemo, useEffect } from "react";
import { FiChevronUp, FiChevronDown } from "react-icons/fi";

const DEFAULT_DATE_START = "2025-01-01";
const CACHE_KEY_STALLINGS = "parking-simulation-statistics-stallings";
const CACHE_KEY_DATA = "parking-simulation-statistics-data";

type StallingListItem = {
  contactName: string;
  parkingName: string;
  bikeparkID: string;
  stallingType: string;
};

type StatisticsDataRow = {
  bikeparkID: string;
  countTransacties: number;
  countPasids: number;
  countBetalingen: number;
  countSync: number;
  countReportOccupation: number;
  countUpdateLocker: number;
  countAddSubscription: number;
  countSubscribe: number;
};

type StatisticsRow = StallingListItem & StatisticsDataRow;

type SortColumn = "contactName" | "parkingName" | "stallingType" | "countStallings" | "countTransacties" | "countPasids" | "countBetalingen" | "countSync" | "countReportOccupation" | "countAddSubscription" | "countSubscribe";
type SortOrder = "asc" | "desc";

type StatisticsTabProps = {
  stallings?: Array<{ id: string; locationid: string; title: string }>;
};

// One column per metric; single/multi (e.g. uploadJsonTransaction vs uploadJsonTransactions) not distinguishable in wachtrij data
const COLUMNS: { key: SortColumn; label: string }[] = [
  { key: "contactName", label: "Contact" },
  { key: "parkingName", label: "Stalling" },
  { key: "stallingType", label: "Stalling type" },
  { key: "countTransacties", label: "uploadJsonTransaction(s)" },
  { key: "countPasids", label: "saveJsonBike(s)" },
  { key: "countBetalingen", label: "addJsonSaldo(s)" },
  { key: "countSync", label: "syncSector" },
  { key: "countReportOccupation", label: "report(Json)OccupationData" },
  { key: "countAddSubscription", label: "addSubscription" },
  { key: "countSubscribe", label: "subscribe" },
];

type OverviewRow = {
  contactName: string;
  stallingType: string;
  countStallings: number;
  countTransacties: number;
  countPasids: number;
  countBetalingen: number;
  countSync: number;
  countReportOccupation: number;
  countUpdateLocker: number;
  countAddSubscription: number;
  countSubscribe: number;
};

const StatisticsTab: React.FC<StatisticsTabProps> = () => {
  const [dateStart, setDateStart] = useState(DEFAULT_DATE_START);
  const [overzicht, setOverzicht] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [stallingsRefreshing, setStallingsRefreshing] = useState(false);
  const [stallingsList, setStallingsList] = useState<StallingListItem[] | null>(null);
  const [statsData, setStatsData] = useState<StatisticsDataRow[] | null>(null);
  const [sortBy, setSortBy] = useState<SortColumn>("contactName");
  const [sortOrder, setSortOrder] = useState<SortOrder>("asc");

  useEffect(() => {
    const cached = typeof window !== "undefined" && localStorage.getItem(CACHE_KEY_STALLINGS);
    if (cached) {
      try {
        const parsed = JSON.parse(cached) as StallingListItem[];
        if (Array.isArray(parsed)) setStallingsList(parsed);
      } catch {
        /* ignore */
      }
    }
  }, []);

  const handleRefreshStallings = async () => {
    setStallingsRefreshing(true);
    try {
      const res = await fetch("/api/protected/parking-simulation/statistics/stallings");
      if (!res.ok) throw new Error("Fout bij ophalen stallings");
      const json = (await res.json()) as { data?: StallingListItem[] };
      const list = json.data ?? [];
      setStallingsList(list);
      if (typeof window !== "undefined") {
        localStorage.setItem(CACHE_KEY_STALLINGS, JSON.stringify(list));
      }
    } catch {
      setStallingsList([]);
    } finally {
      setStallingsRefreshing(false);
    }
  };

  const clearDataCache = () => {
    if (typeof window !== "undefined") {
      const keysToRemove: string[] = [];
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key?.startsWith(CACHE_KEY_DATA)) keysToRemove.push(key);
      }
      keysToRemove.forEach((k) => localStorage.removeItem(k));
    }
  };

  const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setDateStart(e.target.value);
    clearDataCache();
    setStatsData(null);
  };

  const handleSort = (column: SortColumn) => {
    if (sortBy === column) {
      setSortOrder((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(column);
      setSortOrder("asc");
    }
  };

  const mergedData = useMemo((): StatisticsRow[] => {
    if (!stallingsList) return [];
    const dataMap = new Map((statsData ?? []).map((d) => [d.bikeparkID, d]));
    return stallingsList.map((s) => {
      const d = dataMap.get(s.bikeparkID);
      return {
        ...s,
        countTransacties: d?.countTransacties ?? 0,
        countPasids: d?.countPasids ?? 0,
        countBetalingen: d?.countBetalingen ?? 0,
        countSync: d?.countSync ?? 0,
        countReportOccupation: d?.countReportOccupation ?? 0,
        countUpdateLocker: d?.countUpdateLocker ?? 0,
        countAddSubscription: d?.countAddSubscription ?? 0,
        countSubscribe: d?.countSubscribe ?? 0,
      };
    });
  }, [stallingsList, statsData]);

  const overviewData = useMemo((): OverviewRow[] => {
    if (mergedData.length === 0) return [];
    const map = new Map<string, OverviewRow>();
    for (const row of mergedData) {
      const key = `${row.contactName}\0${row.stallingType}`;
      const existing = map.get(key);
      if (existing) {
        existing.countStallings += 1;
        existing.countTransacties += row.countTransacties;
        existing.countPasids += row.countPasids;
        existing.countBetalingen += row.countBetalingen;
        existing.countSync += row.countSync;
        existing.countReportOccupation += row.countReportOccupation;
        existing.countUpdateLocker += row.countUpdateLocker;
        existing.countAddSubscription += row.countAddSubscription;
        existing.countSubscribe += row.countSubscribe;
      } else {
        map.set(key, {
          contactName: row.contactName,
          stallingType: row.stallingType,
          countStallings: 1,
          countTransacties: row.countTransacties,
          countPasids: row.countPasids,
          countBetalingen: row.countBetalingen,
          countSync: row.countSync,
          countReportOccupation: row.countReportOccupation,
          countUpdateLocker: row.countUpdateLocker,
          countAddSubscription: row.countAddSubscription,
          countSubscribe: row.countSubscribe,
        });
      }
    }
    return Array.from(map.values());
  }, [mergedData]);

  const sortedData = useMemo(() => {
    if (mergedData.length === 0) return [];
    const copy = [...mergedData];
    const detailSortKey = sortBy === "countStallings" ? "contactName" : sortBy;
    copy.sort((a, b) => {
      const aVal = a[detailSortKey as keyof StatisticsRow];
      const bVal = b[detailSortKey as keyof StatisticsRow];
      const cmp =
        typeof aVal === "number" && typeof bVal === "number"
          ? aVal - bVal
          : String(aVal ?? "").localeCompare(String(bVal ?? ""), undefined, { numeric: true });
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [mergedData, sortBy, sortOrder]);

  const sortedOverviewData = useMemo(() => {
    if (overviewData.length === 0) return [];
    const copy = [...overviewData];
    const sortKey = sortBy === "parkingName" ? "stallingType" : sortBy;
    copy.sort((a, b) => {
      const aVal = a[sortKey as keyof OverviewRow];
      const bVal = b[sortKey as keyof OverviewRow];
      const cmp =
        typeof aVal === "number" && typeof bVal === "number"
          ? aVal - bVal
          : String(aVal ?? "").localeCompare(String(bVal ?? ""), undefined, { numeric: true });
      return sortOrder === "asc" ? cmp : -cmp;
    });
    return copy;
  }, [overviewData, sortBy, sortOrder]);

  const handleRefresh = async () => {
    setRefreshing(true);
    try {
      const params = new URLSearchParams({ dateStart });
      const res = await fetch(`/api/protected/parking-simulation/statistics/data?${params}`);
      if (!res.ok) throw new Error("Fout bij ophalen data");
      const json = (await res.json()) as { data?: StatisticsDataRow[] };
      const rows = json.data ?? [];
      setStatsData(rows);

      if (typeof window !== "undefined") {
        const cacheKeyForDate = `${CACHE_KEY_DATA}-${dateStart}`;
        localStorage.setItem(cacheKeyForDate, JSON.stringify(rows));
      }
    } catch {
      setStatsData(null);
    } finally {
      setRefreshing(false);
    }
  };

  const SortIcon = ({ column }: { column: SortColumn }) => {
    if (sortBy !== column) return null;
    return sortOrder === "asc" ? (
      <FiChevronUp className="ml-1 inline h-4 w-4" />
    ) : (
      <FiChevronDown className="ml-1 inline h-4 w-4" />
    );
  };

  const hasData = statsData !== null;
  const hasStallings = stallingsList !== null;

  return (
    <div className="bg-white border rounded-lg p-6">
      <h2 className="text-lg font-semibold mb-4">Statistieken</h2>
        <div className="flex flex-wrap items-center gap-4 mb-6">
        <div className="flex items-center gap-2">
          <label htmlFor="stat-date-start" className="text-sm font-medium text-gray-700 leading-10">
            Startdatum
          </label>
          <input
            id="stat-date-start"
            type="date"
            value={dateStart}
            onChange={handleDateChange}
            className="border rounded px-3 h-10 text-sm"
          />
        </div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={overzicht}
            onChange={(e) => setOverzicht(e.target.checked)}
            className="rounded border-gray-300"
          />
          <span className="text-sm font-medium text-gray-700">Overzicht</span>
        </label>
        <button
          type="button"
          onClick={() => void handleRefreshStallings()}
          disabled={stallingsRefreshing}
          className={`h-10 px-4 rounded font-medium text-white flex items-center justify-center transition-colors ${
            stallingsRefreshing
              ? "bg-gray-400 cursor-wait"
              : "bg-gray-600 hover:bg-gray-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
          }`}
        >
          {stallingsRefreshing ? "Bezig…" : "Vernieuw stallinglijst"}
        </button>
        <button
          type="button"
          onClick={() => void handleRefresh()}
          disabled={refreshing || !hasStallings}
          className={`h-10 px-4 rounded font-medium text-white flex items-center justify-center transition-colors ${
            refreshing
              ? "bg-green-400 cursor-wait"
              : !hasStallings
                ? "bg-green-400 cursor-not-allowed"
                : "bg-green-600 hover:bg-green-700 disabled:bg-green-400 disabled:cursor-not-allowed"
          }`}
        >
          {refreshing ? "Bezig…" : "Vernieuw"}
        </button>
      </div>

      {!hasStallings ? (
        <p className="text-gray-500">Druk op vernieuw stallinglijst</p>
      ) : overzicht ? (
        <div className="overflow-x-auto w-fit max-w-full">
          <table className="w-fit text-sm border border-gray-200 rounded">
            <thead>
              <tr className="bg-gray-50">
                <th
                  className="px-3 py-2 text-left font-medium text-gray-700 border-b cursor-pointer hover:bg-gray-100 select-none text-[1.25rem]"
                  onClick={() => handleSort("contactName")}
                >
                  Contact
                  <SortIcon column="contactName" />
                </th>
                <th
                  className="px-3 py-2 text-left font-medium text-gray-700 border-b cursor-pointer hover:bg-gray-100 select-none text-[1.25rem]"
                  onClick={() => handleSort("stallingType")}
                >
                  Stalling type
                  <SortIcon column="stallingType" />
                </th>
                <th
                  className="px-1 py-2 font-medium text-gray-700 border-b cursor-pointer hover:bg-gray-100 select-none text-[1.25rem]"
                  style={{ writingMode: "vertical-rl", textOrientation: "mixed", width: "2rem", minWidth: "2rem" }}
                  onClick={() => handleSort("countStallings")}
                >
                  aantal
                  <SortIcon column="countStallings" />
                </th>
                {COLUMNS.filter((c) => c.key.startsWith("count")).map(({ key, label }) => (
                  <th
                    key={label}
                    className="px-1 py-2 font-medium text-gray-700 border-b cursor-pointer hover:bg-gray-100 select-none text-[1.25rem]"
                    style={{ writingMode: "vertical-rl", textOrientation: "mixed", width: "2rem", minWidth: "2rem" }}
                    onClick={() => handleSort(key)}
                  >
                    {label}
                    <SortIcon column={key} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sortedOverviewData.map((row, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  <td className="px-3 py-2 text-gray-800">{row.contactName}</td>
                  <td className="px-3 py-2 text-gray-800">{row.stallingType}</td>
                  <td className="px-1 py-2 text-right text-gray-800">{row.countStallings}</td>
                  {COLUMNS.filter((c) => c.key.startsWith("count")).map(({ key, label }) => {
                    const val = row[key as keyof OverviewRow] as number;
                    return (
                      <td key={label} className="px-1 py-2 text-center">
                        {hasData ? (val > 0 ? <input type="checkbox" checked readOnly className="rounded" /> : null) : "–"}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="overflow-x-auto w-fit max-w-full">
          <table className="w-fit text-sm border border-gray-200 rounded">
            <thead>
              <tr className="bg-gray-50">
                {COLUMNS.map(({ key, label }) => {
                  const isCount = key.startsWith("count");
                  return (
                    <th
                      key={label}
                      className={`py-2 font-medium text-gray-700 border-b cursor-pointer hover:bg-gray-100 select-none text-[1.25rem] ${isCount ? "px-1" : "text-left px-3"}`}
                      style={isCount ? { writingMode: "vertical-rl", textOrientation: "mixed", width: "2rem", minWidth: "2rem" } : undefined}
                      onClick={() => handleSort(key)}
                    >
                      {isCount ? (
                        <>
                          {label}
                          <SortIcon column={key} />
                        </>
                      ) : (
                        <>
                          {label}
                          <SortIcon column={key} />
                        </>
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {sortedData.map((row, i) => (
                <tr key={i} className="border-b border-gray-100 last:border-0 hover:bg-gray-50">
                  {COLUMNS.map(({ key, label }) => {
                    const isCount = key.startsWith("count");
                    const val = row[key as keyof StatisticsRow];
                    if (key === "parkingName") {
                      return (
                        <td key={label} className="px-3 py-2 text-gray-800">
                          {row.parkingName} ({row.bikeparkID})
                        </td>
                      );
                    }
                    if (isCount) {
                      return (
                        <td key={label} className="px-1 py-2 text-right">
                          {hasData ? (typeof val === "number" ? val : "–") : "–"}
                        </td>
                      );
                    }
                    return (
                      <td key={label} className="px-3 py-2 text-gray-800">
                        {String(val ?? "")}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {hasStallings && (
        <p className="mt-4 text-sm text-gray-500">
          Verwijderde stallings (aanwezig in wachtrij maar niet meer in fietsenstallingen) worden niet meegenomen in deze statistiek.
        </p>
      )}
    </div>
  );
};

export default StatisticsTab;
