import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Table, type Column } from "~/components/common/Table";
import type { AdminBulkReservationRow } from "~/types/bulkreserveringen-admin";

function formatDt(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("nl-NL", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const BulkreserveringenTable: React.FC = () => {
  const [rows, setRows] = useState<AdminBulkReservationRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const [onlyActive, setOnlyActive] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch("/api/protected/database/bulkreserveringen");
        const json = (await res.json()) as { data?: AdminBulkReservationRow[]; error?: string };
        if (!res.ok) throw new Error(json.error ?? "Laden mislukt");
        setRows(json.data ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Laden mislukt");
      } finally {
        setLoading(false);
      }
    };
    void load();
  }, []);

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase();
    return rows.filter((r) => {
      if (onlyActive && !r.actief) return false;
      if (!q) return true;
      const hay = [
        r.dataOwnerName,
        r.stallingTitle,
        r.stallingsId,
        r.sectieTitel,
        String(r.id),
        String(r.aantal),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, filter, onlyActive]);

  const columns: Column<AdminBulkReservationRow>[] = [
    { header: "ID", accessor: (r) => r.id },
    {
      header: "Data-eigenaar",
      accessor: (r) => r.dataOwnerName ?? r.siteId ?? "—",
    },
    {
      header: "Stalling",
      accessor: (r) =>
        r.stallingId ? (
          <Link
            href={`/beheer/fietsenstallingen?id=${encodeURIComponent(r.stallingId)}`}
            className="text-blue-600 underline"
            onClick={(e) => e.stopPropagation()}
          >
            {r.stallingsId ?? r.stallingId}
            {r.stallingTitle ? ` — ${r.stallingTitle}` : ""}
          </Link>
        ) : (
          r.stallingsId ?? "—"
        ),
    },
    { header: "Sectie", accessor: (r) => r.sectieTitel ?? r.sectieId ?? "—" },
    { header: "Aantal", accessor: (r) => r.aantal ?? "—" },
    { header: "Start", accessor: (r) => formatDt(r.startdatumtijd) },
    { header: "Eind", accessor: (r) => formatDt(r.einddatumtijd) },
    {
      header: "Wekelijks",
      accessor: (r) => (r.terugkerend ? "Ja" : "Nee"),
    },
    {
      header: "Uitzonderingen",
      accessor: (r) => r.uitzonderingenCount,
    },
    {
      header: "Status",
      accessor: (r) => (
        <span className={r.actief ? "text-green-700" : "text-gray-500"}>
          {r.actief ? "Actief" : "Verlopen"}
        </span>
      ),
    },
  ];

  return (
    <div className="p-6">
      <h1 className="mb-2 text-3xl font-bold">Bulkreserveringen</h1>
      <p className="mb-6 text-sm text-gray-600">
        Alle rijen in <code className="text-xs">bulkreservering</code>, met data-eigenaar en stalling.
        Bewerken kan via de stalling (tab Capaciteit).
      </p>

      <div className="mb-4 flex flex-wrap items-center gap-4">
        <label className="flex flex-col text-sm">
          Zoeken
          <input
            type="search"
            className="mt-1 rounded border px-2 py-1"
            placeholder="Naam, StallingsID, sectie…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={onlyActive}
            onChange={(e) => setOnlyActive(e.target.checked)}
          />
          Alleen actieve (eindtijd ≥ nu)
        </label>
        <span className="text-sm text-gray-600">
          {filtered.length} van {rows.length} rijen
        </span>
      </div>

      {loading && <p>Laden…</p>}
      {error && <p className="text-red-600">{error}</p>}
      {!loading && !error && (
        <Table columns={columns} data={filtered} className="border border-gray-200" />
      )}
    </div>
  );
};

export default BulkreserveringenTable;
