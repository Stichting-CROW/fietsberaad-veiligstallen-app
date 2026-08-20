import React, { useMemo, useState } from "react";
import { LoadingSpinner } from "~/components/beheer/common/LoadingSpinner";
import { SearchFilter } from "~/components/common/SearchFilter";
import { Table, type Column } from "~/components/common/Table";
import { useFmsPermitsOverview } from "~/hooks/useFmsPermits";
import { useFietsenstallingtypen } from "~/hooks/useFietsenstallingtypen";
import {
  FMS_PERMIT_TYPES,
  parsePermitTypes,
  type VSFmsMissingCoupling,
  type VSFmsServicePermitRow,
} from "~/types/fms-permits";

const GEMEENTE_BREED_FILTER = "__gemeente_breed__";

// A select's intrinsic content box is shorter than a text input's at the same
// font size, so the height is fixed here to keep the filter row aligned.
const FILTER_CONTROL_CLASS =
  "h-9 rounded border border-gray-300 px-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

function formatFmsFlag(fms: boolean | null): string {
  if (fms === null) return "—";
  return fms ? "Ja" : "Nee";
}

type OverviewRow = VSFmsServicePermitRow & {
  operatorCol: string;
  gemeenteCol: string;
  locatieCol: string;
  typeCol: string;
  fmsCol: string;
  operatorPermit: boolean;
  type1Permit: boolean;
  type2Permit: boolean;
};

const Overzicht: React.FC = () => {
  const { permits, missingCouplings, isLoading, error } = useFmsPermitsOverview();
  const { fietsenstallingtypen } = useFietsenstallingtypen();
  const [filterText, setFilterText] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [fmsFilter, setFmsFilter] = useState("all");
  const [missingTypeFilter, setMissingTypeFilter] = useState("all");
  const [sortColumn, setSortColumn] = useState<string>("Gemeente");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  const tableData: OverviewRow[] = useMemo(
    () =>
      permits.map((p) => {
        const types = parsePermitTypes(p.Permit);
        return {
          ...p,
          operatorCol: p.operatorName ?? "",
          gemeenteCol: p.gemeenteName ?? "",
          locatieCol: p.locationLabel ?? "",
          typeCol: p.parkingTypeName ?? (p.BikeparkID ? "—" : "Gemeente-breed"),
          fmsCol: formatFmsFlag(p.fms),
          operatorPermit: types.includes("operator"),
          type1Permit: types.includes("dataprovider.type1"),
          type2Permit: types.includes("dataprovider.type2"),
        };
      }),
    [permits]
  );

  const filtered = useMemo(() => {
    let rows = tableData;

    if (typeFilter === GEMEENTE_BREED_FILTER) {
      rows = rows.filter((row) => !row.BikeparkID);
    } else if (typeFilter !== "all") {
      rows = rows.filter((row) => row.parkingTypeId === typeFilter);
    }

    if (fmsFilter === "yes") {
      rows = rows.filter((row) => row.fms === true);
    } else if (fmsFilter === "no") {
      rows = rows.filter((row) => row.fms === false);
    } else if (fmsFilter === "na") {
      rows = rows.filter((row) => row.fms === null);
    }

    const q = filterText.toLowerCase();
    if (!q) return rows;
    return rows.filter(
      (row) =>
        row.operatorCol.toLowerCase().includes(q) ||
        row.gemeenteCol.toLowerCase().includes(q) ||
        row.locatieCol.toLowerCase().includes(q) ||
        row.typeCol.toLowerCase().includes(q) ||
        row.fmsCol.toLowerCase().includes(q)
    );
  }, [tableData, filterText, typeFilter, fmsFilter]);

  const filteredMissing = useMemo(() => {
    if (missingTypeFilter === "all") return missingCouplings;
    return missingCouplings.filter((row) => row.parkingTypeId === missingTypeFilter);
  }, [missingCouplings, missingTypeFilter]);

  const sorted = useMemo(() => {
    const colMap: Record<string, keyof OverviewRow> = {
      Dataleverancier: "operatorCol",
      Gemeente: "gemeenteCol",
      Locatie: "locatieCol",
      Type: "typeCol",
      FMS: "fmsCol",
    };
    const key = colMap[sortColumn] ?? "gemeenteCol";
    return [...filtered].sort((a, b) => {
      const av = String(a[key] ?? "");
      const bv = String(b[key] ?? "");
      const cmp = av.localeCompare(bv, "nl");
      return sortDirection === "asc" ? cmp : -cmp;
    });
  }, [filtered, sortColumn, sortDirection]);

  const handleSort = (header: string) => {
    if (sortColumn === header) {
      setSortDirection((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(header);
      setSortDirection("asc");
    }
  };

  const columns: Column<OverviewRow>[] = [
    { header: "Dataleverancier", accessor: "operatorCol" },
    { header: "Gemeente", accessor: "gemeenteCol" },
    { header: "Locatie", accessor: "locatieCol" },
    { header: "Type", accessor: "typeCol" },
    {
      header: "FMS",
      accessor: "fmsCol",
      className: "text-center",
    },
    {
      header: FMS_PERMIT_TYPES[0].label,
      accessor: (row) => (row.operatorPermit ? "✓" : ""),
      className: "text-center",
    },
    {
      header: FMS_PERMIT_TYPES[1].label,
      accessor: (row) => (row.type1Permit ? "✓" : ""),
      className: "text-center",
    },
    {
      header: FMS_PERMIT_TYPES[2].label,
      accessor: (row) => (row.type2Permit ? "✓" : ""),
      className: "text-center",
    },
  ];

  const missingColumns: Column<VSFmsMissingCoupling>[] = [
    { header: "Gemeente", accessor: "gemeenteName" },
    { header: "StallingsID", accessor: "stallingsID" },
    { header: "Titel", accessor: "title" },
    { header: "Type", accessor: (row) => row.parkingTypeName ?? row.parkingTypeId ?? "—" },
    {
      header: "FMS",
      accessor: (row) => (row.fms ? "Ja" : "Nee"),
      className: "text-center",
    },
    { header: "Plaats", accessor: "plaats" },
  ];

  if (isLoading) {
    return <LoadingSpinner message="FMS-overzicht laden..." />;
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        {error}
      </div>
    );
  }

  return (
    <div>
      <h1 className="mb-2 text-2xl font-semibold text-gray-900">
        FMS-toegang — overzicht
      </h1>
      <p className="mb-6 text-sm text-gray-600">
        Alle koppelingen tussen dataleveranciers en stallingen/gemeenten.
      </p>

      <div className="mb-4 flex flex-wrap items-end gap-4">
        <SearchFilter
          id="fms-permits-overview-filter"
          label="Zoeken"
          value={filterText}
          onChange={setFilterText}
          placeholder="Dataleverancier, gemeente, locatie of type..."
          className="max-w-md"
          inputClassName={FILTER_CONTROL_CLASS}
        />
        <div>
          <label htmlFor="fms-type-filter" className="mb-1 block text-sm font-medium text-gray-700">
            Stallingtype
          </label>
          <select
            id="fms-type-filter"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className={`${FILTER_CONTROL_CLASS} w-52`}
          >
            <option value="all">Alle types</option>
            <option value={GEMEENTE_BREED_FILTER}>Gemeente-breed</option>
            {fietsenstallingtypen.map((type) => (
              <option key={type.id} value={type.id}>
                {type.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="fms-flag-filter" className="mb-1 block text-sm font-medium text-gray-700">
            FMS
          </label>
          <select
            id="fms-flag-filter"
            value={fmsFilter}
            onChange={(e) => setFmsFilter(e.target.value)}
            className={`${FILTER_CONTROL_CLASS} w-52`}
          >
            <option value="all">Alle</option>
            <option value="yes">Ja (FMS-stalling)</option>
            <option value="no">Nee</option>
            <option value="na">N.v.t. (gemeente-breed)</option>
          </select>
        </div>
      </div>

      <Table
        columns={columns}
        data={sorted}
        className="mb-10 min-w-full bg-white"
        sortableColumns={["Dataleverancier", "Gemeente", "Locatie", "Type", "FMS"]}
        sortColumn={sortColumn}
        sortDirection={sortDirection}
        onSort={handleSort}
      />

      {missingCouplings.length > 0 && (
        <section>
          <h2 className="mb-2 text-lg font-semibold text-amber-900">
            Ontbrekende koppelingen
          </h2>
          <p className="mb-4 text-sm text-gray-600">
            Bewaakte/geautomatiseerde FMS-stallingen zonder actieve dataleverancier-koppeling
            (en zonder gemeente-brede permit).
          </p>
          <div className="mb-4">
            <label htmlFor="fms-missing-type-filter" className="mb-1 block text-sm font-medium text-gray-700">
              Stallingtype
            </label>
            <select
              id="fms-missing-type-filter"
              value={missingTypeFilter}
              onChange={(e) => setMissingTypeFilter(e.target.value)}
              className={`${FILTER_CONTROL_CLASS} w-52`}
            >
              <option value="all">Alle types</option>
              {fietsenstallingtypen.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>
          <Table
            columns={missingColumns}
            data={filteredMissing}
            className="min-w-full border border-amber-200 bg-amber-50/30"
          />
        </section>
      )}
    </div>
  );
};

export default Overzicht;
