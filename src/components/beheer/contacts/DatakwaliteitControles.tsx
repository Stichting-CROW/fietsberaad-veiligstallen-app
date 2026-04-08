import React, { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { Table } from "~/components/common/Table";
import { SearchFilter } from "~/components/common/SearchFilter";
import { LoadingSpinner } from "~/components/beheer/common/LoadingSpinner";
import type { DatakwaliteitControleWithRelations } from "~/pages/api/protected/contactsgemeenten/datakwaliteit-controles";

function formatDatumTijd(date: Date): string {
  return new Date(date).toLocaleDateString("nl-NL", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Capitalize first letter (e.g. "maandag" -> "Maandag")
function capitalizeFirst(str: string): string {
  if (!str) return str;
  return str.charAt(0).toUpperCase() + str.slice(1);
}

export default function DatakwaliteitControles() {
  const [controles, setControles] = useState<DatakwaliteitControleWithRelations[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchFilter, setSearchFilter] = useState("");
  const [sortColumn, setSortColumn] = useState<string>("Datum/tijd");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");

  useEffect(() => {
    let cancelled = false;
    const fetchControles = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const res = await fetch("/api/protected/contactsgemeenten/datakwaliteit-controles");
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error ?? "Fout bij laden");
        }
        if (!cancelled) {
          setControles(data.data ?? []);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Er is een fout opgetreden");
          setControles([]);
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchControles();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredData = useMemo(() => {
    if (!searchFilter.trim()) return controles;
    const q = searchFilter.toLowerCase().trim();
    return controles.filter((c) => {
      const dataEigenaar = (c.contact?.CompanyName ?? "").toLowerCase();
      const controleurName = (c.user?.DisplayName ?? "").toLowerCase();
      const controleurEmail = (c.user?.UserName ?? "").toLowerCase();
      return (
        dataEigenaar.includes(q) ||
        controleurName.includes(q) ||
        controleurEmail.includes(q)
      );
    });
  }, [controles, searchFilter]);

  const sortedData = useMemo(() => {
    return [...filteredData].sort((a, b) => {
      let comparison = 0;
      switch (sortColumn) {
        case "Datum/tijd":
          comparison =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
        case "Data-eigenaar":
          comparison = (a.contact?.CompanyName ?? "").localeCompare(
            b.contact?.CompanyName ?? "",
            "nl"
          );
          break;
        case "Controleur":
          comparison = (a.user?.DisplayName ?? a.user?.UserName ?? "").localeCompare(
            b.user?.DisplayName ?? b.user?.UserName ?? "",
            "nl"
          );
          break;
        default:
          comparison = 0;
      }
      return sortDirection === "asc" ? comparison : -comparison;
    });
  }, [filteredData, sortColumn, sortDirection]);

  const handleSort = (header: string) => {
    if (sortColumn === header) {
      setSortDirection(sortDirection === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(header);
      setSortDirection(header === "Datum/tijd" ? "desc" : "asc");
    }
  };

  if (isLoading) {
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-4">Datakwaliteit-controles</h1>
        <LoadingSpinner message="Datakwaliteit-controles laden..." />
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Datakwaliteit-controles</h1>
      <p className="text-gray-600 mb-6">
        Op deze pagina zie je alle laatste datakwaliteit-controles uitgevoerd door
        contactpersonen
      </p>

      {error && (
        <div className="rounded-md bg-red-50 p-4 mb-6">
          <div className="text-sm text-red-800">{error}</div>
        </div>
      )}

      <div className="mb-4">
        <SearchFilter
          id="datakwaliteit-search"
          label="Zoeken"
          value={searchFilter}
          onChange={setSearchFilter}
          placeholder="Zoek op data-eigenaar of controleur..."
          className="max-w-md"
        />
      </div>

      <Table
        columns={[
          {
            header: "Datum/tijd",
            accessor: (row) =>
              capitalizeFirst(formatDatumTijd(new Date(row.createdAt))),
          },
          {
            header: "Data-eigenaar",
            accessor: (row) => row.contact?.CompanyName ?? "—",
          },
          {
            header: "Controleur",
            accessor: (row) => {
              const name = row.user?.DisplayName ?? row.user?.UserName ?? "—";
              const email = row.user?.UserName?.includes("@")
                ? row.user.UserName
                : null;
              const displayText = email ? `${name} (${email})` : name;
              const userId = row.user_id;
              return (
                <Link
                  href={`/beheer/usersgebruikersbeheerfietsberaad/${userId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sky-600 hover:text-sky-800 hover:underline"
                >
                  {displayText}
                </Link>
              );
            },
          },
        ]}
        data={sortedData}
        className="mt-4"
        sortableColumns={["Datum/tijd", "Data-eigenaar", "Controleur"]}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={handleSort}
      />

      {sortedData.length === 0 && !error && (
        <p className="text-gray-500 mt-4">Geen datakwaliteit-controles gevonden.</p>
      )}
    </div>
  );
}
