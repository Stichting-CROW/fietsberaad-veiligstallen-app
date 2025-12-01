import React, { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { LoadingSpinner } from "../beheer/common/LoadingSpinner";
import FormInput from "~/components/Form/FormInput";
import { Checkbox, FormControlLabel } from "@mui/material";
import { Button } from "~/components/Button";
import PageTitle from "~/components/PageTitle";
import type { TariefRow } from "~/server/services/tarieven";
import type { TarievenData } from "~/pages/api/protected/fietsenstallingen/[id]/tarieven";
import { useSectiesByFietsenstalling } from "~/hooks/useSectiesByFietsenstalling";
import { useBikeTypes } from "~/hooks/useBikeTypes";
import type { SectieDetailsType, SectieFietstypeType } from "~/types/secties";

type TariffScopeType = "stalling" | "section" | "bikeType";

type TariffScopeDescriptor = {
  key: string;
  scopeType: TariffScopeType;
  label: string;
  subtitle?: string;
  sectionId?: number | null;
  sectionLabel?: string;
  bikeTypeId?: number | null;
  bikeTypeLabel?: string;
  sectionBikeTypeId?: number | null;
};

type EditableTariefRow = {
  key: string;
  scopeKey: string;
  tariefregelID?: number;
  sectionId?: number | null;
  bikeTypeId?: number | null;
  sectionBikeTypeId?: number | null;
  index: number;
  tijdsspanne: number | null;
  kosten: number | null;
  isPlaceholder?: boolean;
  isNew?: boolean;
  orderToken: number;
};

type TariffFlags = {
  hasUniSectionPrices: boolean;
  hasUniBikeTypePrices: boolean;
};

type NormalizedTariffRow = TariefRow & {
  scopeKey: string;
};

type TariffChangeEntry = {
  scope?: TariffScopeDescriptor;
  type: "nieuw" | "gewijzigd" | "verwijderd";
  before?: NormalizedTariffRow;
  after?: NormalizedTariffRow;
};

const sanitizeNumberInput = (value: string): number | null => {
  if (value === undefined || value === null) {
    return null;
  }
  const trimmed = value.toString().trim();
  if (trimmed === "") {
    return null;
  }
  const normalized = trimmed.replace(",", ".");
  const parsed = Number(normalized);
  if (Number.isNaN(parsed)) {
    return null;
  }
  return parsed < 0 ? 0 : parsed;
};

const DISCARDED_SCOPE_KEY = "__incompatible__";

const normalizeTariefRow = (
  row: TariefRow,
  scopeKey: string,
  indexOverride?: number,
): NormalizedTariffRow => ({
  ...row,
  scopeKey,
  index: indexOverride ?? row.index ?? null,
  sectieID: row.sectieID ?? null,
  sectionBikeTypeID: row.sectionBikeTypeID ?? null,
  bikeTypeID: row.bikeTypeID ?? null,
  stallingsID: row.stallingsID ?? null,
});

const isRowCompatibleWithFlags = (row: TariefRow, flags: TariffFlags) => {
  const hasSection = row.sectieID !== null && row.sectieID !== undefined;
  const hasSectionBikeType =
    row.sectionBikeTypeID !== null && row.sectionBikeTypeID !== undefined;

  if (flags.hasUniSectionPrices && flags.hasUniBikeTypePrices) {
    return !hasSection && !hasSectionBikeType;
  }

  if (!flags.hasUniSectionPrices && flags.hasUniBikeTypePrices) {
    return hasSection && !hasSectionBikeType;
  }

  if (flags.hasUniSectionPrices && !flags.hasUniBikeTypePrices) {
    return hasSectionBikeType;
  }

  return hasSection && hasSectionBikeType;
};

const deriveScopeKeyFromFlags = (
  row: Partial<TariefRow>,
  flags: TariffFlags,
): string | null => {
  if (!("sectieID" in row) || !("sectionBikeTypeID" in row)) {
    return null;
  }

  const castRow = row as TariefRow;

  if (!isRowCompatibleWithFlags(castRow, flags)) {
    return null;
  }

  if (flags.hasUniSectionPrices && flags.hasUniBikeTypePrices) {
    return "stalling";
  }

  if (!flags.hasUniSectionPrices && flags.hasUniBikeTypePrices) {
    const sectionId = castRow.sectieID;
    return sectionId !== null && sectionId !== undefined
      ? `section:${sectionId}`
      : null;
  }

  const sectionBikeTypeId =
    castRow.sectionBikeTypeID ??
    (castRow as { sectionBikeTypeId?: number | null }).sectionBikeTypeId ??
    null;

  if (sectionBikeTypeId !== null && sectionBikeTypeId !== undefined) {
    return `bikeType:${sectionBikeTypeId}`;
  }

  return null;
};

const createPlaceholderRow = (
  scope: TariffScopeDescriptor,
  nextIndex: number,
  allocateRowKey: () => string,
): EditableTariefRow => ({
  key: `placeholder-${scope.key}-${allocateRowKey()}`,
  scopeKey: scope.key,
  sectionId: scope.sectionId ?? null,
  bikeTypeId: scope.bikeTypeId ?? null,
  sectionBikeTypeId: scope.sectionBikeTypeId ?? null,
  index: nextIndex,
  tijdsspanne: null,
  kosten: null,
  isPlaceholder: true,
  orderToken: Number.MAX_SAFE_INTEGER,
});

const buildEditableRowsForScope = (
  scope: TariffScopeDescriptor,
  rows: NormalizedTariffRow[],
  allocateRowKey: () => string,
): EditableTariefRow[] => {
  const existingRows: EditableTariefRow[] = rows.map((row, idx) => ({
    key: row.tariefregelID
      ? `existing-${row.tariefregelID}`
      : `row-${scope.key}-${allocateRowKey()}`,
    scopeKey: scope.key,
    tariefregelID: row.tariefregelID,
    sectionId:
      row.sectieID ?? scope.sectionId ?? null,
    bikeTypeId: row.bikeTypeID ?? scope.bikeTypeId ?? null,
    sectionBikeTypeId:
      row.sectionBikeTypeID ?? scope.sectionBikeTypeId ?? null,
    index: row.index ?? idx + 1,
    tijdsspanne: row.tijdsspanne,
    kosten: row.kosten,
    isPlaceholder: false,
    isNew: false,
    orderToken: row.index ?? idx + 1,
  }));

  return [
    ...existingRows,
    createPlaceholderRow(scope, existingRows.length + 1, allocateRowKey),
  ];
};

const normalizeEditableScopeRows = (
  scope: TariffScopeDescriptor,
  rows: EditableTariefRow[],
  allocateRowKey: () => string,
): EditableTariefRow[] => {
  const actualRows = rows
    .filter((row) => !row.isPlaceholder)
    .filter((row) => !(row.tijdsspanne === null && row.kosten === null))
    .sort((a, b) => (a.orderToken ?? 0) - (b.orderToken ?? 0))
    .map((row, idx) => ({
      ...row,
      index: idx + 1,
      sectionId: row.sectionId ?? scope.sectionId ?? null,
      bikeTypeId: row.bikeTypeId ?? scope.bikeTypeId ?? null,
      sectionBikeTypeId: row.sectionBikeTypeId ?? scope.sectionBikeTypeId ?? null,
    }));

  const placeholder =
    rows.find((row) => row.isPlaceholder) ??
    createPlaceholderRow(scope, actualRows.length + 1, allocateRowKey);

  return [
    ...actualRows,
    {
      ...placeholder,
      index: actualRows.length + 1,
      sectionId: scope.sectionId ?? null,
      bikeTypeId: scope.bikeTypeId ?? null,
      sectionBikeTypeId: scope.sectionBikeTypeId ?? null,
    },
  ];
};

const groupTariffsByScope = (
  tariffs: TariefRow[],
  flags: TariffFlags,
): {
  grouped: Record<string, NormalizedTariffRow[]>;
  discarded: NormalizedTariffRow[];
} => {
  const grouped: Record<string, NormalizedTariffRow[]> = {};
  const discarded: NormalizedTariffRow[] = [];

  tariffs.forEach((row) => {
    const scopeKey = deriveScopeKeyFromFlags(row, flags);
    if (!scopeKey) {
      discarded.push(normalizeTariefRow(row, DISCARDED_SCOPE_KEY));
      return;
    }
    if (!grouped[scopeKey]) {
      grouped[scopeKey] = [];
    }
    grouped[scopeKey]!.push({
      ...row,
      scopeKey,
      index: row.index ?? null,
    });
  });

  for (const key of Object.keys(grouped)) {
    const rows = grouped[key] ?? [];
    grouped[key] = rows
      .sort((a, b) => (a.index ?? 0) - (b.index ?? 0))
      .map((row, idx) => ({
        ...row,
        index: idx + 1,
      }));
  }

  return { grouped, discarded };
};

const isRowInvalid = (row: EditableTariefRow): boolean => {
  if (row.isPlaceholder) {
    return false;
  }
  const hasTijdsspanne = row.tijdsspanne !== null && row.tijdsspanne !== undefined;
  const hasKosten = row.kosten !== null && row.kosten !== undefined;
  
  // Both fields must be present or both must be absent
  if (hasTijdsspanne !== hasKosten) {
    return true;
  }
  
  // If tijdsspanne is set, it must be greater than zero
  if (hasTijdsspanne && (row.tijdsspanne === null || row.tijdsspanne <= 0)) {
    return true;
  }
  
  return false;
};

const buildScopeDescriptors = (
  sections: SectieDetailsType[],
  bikeTypeNameMap: Map<number, string>,
  tariffs: TariefRow[],
  flags: TariffFlags,
): TariffScopeDescriptor[] => {
  const descriptors: TariffScopeDescriptor[] = [];
  const seenKeys = new Set<string>();

  const ensureScope = (scope: TariffScopeDescriptor) => {
    if (!seenKeys.has(scope.key)) {
      descriptors.push(scope);
      seenKeys.add(scope.key);
    }
  };

  if (flags.hasUniSectionPrices && flags.hasUniBikeTypePrices) {
    ensureScope({
      key: "stalling",
      scopeType: "stalling",
      label: "Alle secties & fietstypen",
    });
  } else if (!flags.hasUniSectionPrices && flags.hasUniBikeTypePrices) {
    sections.forEach((section) =>
      ensureScope({
        key: `section:${section.sectieId}`,
        scopeType: "section",
        label: section.titel || `Sectie ${section.sectieId}`,
        sectionLabel: section.titel || `Sectie ${section.sectieId}`,
        sectionId: section.sectieId,
      }),
    );
  } else if (flags.hasUniSectionPrices && !flags.hasUniBikeTypePrices) {
    const bikeTypesById = new Map<number, SectieFietstypeType>();

    sections.forEach((section) => {
      section.secties_fietstype.forEach((bikeType) => {
        if (
          bikeType.Toegestaan === false ||
          typeof bikeType.SectionBiketypeID !== "number" ||
          typeof bikeType.BikeTypeID !== "number"
        ) {
          return;
        }
        if (!bikeTypesById.has(bikeType.BikeTypeID)) {
          bikeTypesById.set(bikeType.BikeTypeID, bikeType);
        }
      });
    });

    bikeTypesById.forEach((bikeType, bikeTypeId) => {
      const label =
        bikeTypeNameMap.get(bikeTypeId) ?? `Fietstype ${bikeTypeId}`;
      ensureScope({
        key: `bikeType:${bikeType.SectionBiketypeID}`,
        scopeType: "bikeType",
        label,
        bikeTypeLabel: label,
        bikeTypeId,
        sectionBikeTypeId: bikeType.SectionBiketypeID,
      });
    });
  } else {
    sections.forEach((section) => {
      const sectionLabel = section.titel || `Sectie ${section.sectieId}`;
      section.secties_fietstype.forEach((bikeType) => {
        if (
          bikeType.Toegestaan === false ||
          typeof bikeType.SectionBiketypeID !== "number"
        ) {
          return;
        }
        const bikeTypeId = bikeType.BikeTypeID ?? undefined;
        const label =
          (bikeTypeId !== undefined
            ? bikeTypeNameMap.get(bikeTypeId)
            : null) ?? `Fietstype ${bikeTypeId ?? ""}`.trim();

        ensureScope({
          key: `bikeType:${bikeType.SectionBiketypeID}`,
          scopeType: "bikeType",
          label,
          sectionLabel,
          sectionId: section.sectieId,
          bikeTypeId,
          bikeTypeLabel: label,
          sectionBikeTypeId: bikeType.SectionBiketypeID,
        });
      });
    });
  }

  tariffs.forEach((row) => {
    const scopeKey = deriveScopeKeyFromFlags(row, flags);
    if (!scopeKey || seenKeys.has(scopeKey)) {
      return;
    }

    const sectionLabel = row.sectieID
      ? `Sectie ${row.sectieID}`
      : undefined;
    const bikeTypeLabel =
      row.bikeTypeID !== null && row.bikeTypeID !== undefined
        ? bikeTypeNameMap.get(row.bikeTypeID) ?? `Fietstype ${row.bikeTypeID}`
        : undefined;

    ensureScope({
      key: scopeKey,
      scopeType:
        flags.hasUniSectionPrices && flags.hasUniBikeTypePrices
          ? "stalling"
          : flags.hasUniBikeTypePrices
            ? "section"
            : "bikeType",
      label: bikeTypeLabel ?? sectionLabel ?? "Onbekende scope",
      sectionLabel,
      sectionId: row.sectieID ?? null,
      bikeTypeId: row.bikeTypeID ?? null,
      bikeTypeLabel,
      sectionBikeTypeId: row.sectionBikeTypeID ?? null,
    });
  });

  if (descriptors.length === 0) {
    ensureScope({
      key: "stalling",
      scopeType: "stalling",
      label: "Algemene tarieven",
    });
  }

  return descriptors;
};

const computeChangeLog = (
  original: Record<string, NormalizedTariffRow[]>,
  draft: Record<string, NormalizedTariffRow[]>,
  scopeMeta: Record<string, TariffScopeDescriptor>,
): TariffChangeEntry[] => {
  const entries: TariffChangeEntry[] = [];
  const scopeKeys = new Set([
    ...Object.keys(original),
    ...Object.keys(draft),
  ]);

  scopeKeys.forEach((scopeKey) => {
    const scope = scopeMeta[scopeKey];
    const originalRows = original[scopeKey] ?? [];
    const draftRows = draft[scopeKey] ?? [];
    const draftById = new Map<number, NormalizedTariffRow>();
    const matchedIds = new Set<number>();

    draftRows.forEach((row) => {
      if (row.tariefregelID !== undefined && row.tariefregelID !== null) {
        draftById.set(row.tariefregelID, row);
      }
    });

    originalRows.forEach((origRow) => {
      if (
        origRow.tariefregelID !== undefined &&
        origRow.tariefregelID !== null &&
        draftById.has(origRow.tariefregelID)
      ) {
        const updatedRow = draftById.get(origRow.tariefregelID)!;
        matchedIds.add(origRow.tariefregelID);
        if (
          origRow.index !== updatedRow.index ||
          origRow.tijdsspanne !== updatedRow.tijdsspanne ||
          origRow.kosten !== updatedRow.kosten
        ) {
          entries.push({
            scope,
            type: "gewijzigd",
            before: { ...origRow },
            after: { ...updatedRow },
          });
        }
      } else if (
        origRow.tariefregelID !== undefined &&
        origRow.tariefregelID !== null
      ) {
        entries.push({
          scope,
          type: "verwijderd",
          before: { ...origRow },
        });
      }
    });

    draftRows.forEach((row) => {
      if (
        row.tariefregelID !== undefined &&
        row.tariefregelID !== null &&
        matchedIds.has(row.tariefregelID)
      ) {
        return;
      }

      if (row.tariefregelID !== undefined && row.tariefregelID !== null) {
        const hasOriginal =
          originalRows.find(
            (orig) => orig.tariefregelID === row.tariefregelID,
          ) !== undefined;
        if (hasOriginal) {
          return;
        }
      }

      entries.push({
        scope,
        type: "nieuw",
        after: { ...row },
      });
    });
  });

  return entries;
};

// type TariefInputRow = {
//   index: number;
//   tijdsspanne: number | null;
//   kosten: number | null;
// };

// type TariffTableRow = {
//   key: string;
//   label: React.ReactNode;
//   scopeKey: string;
//   sectionId?: number;
//   sectionBikeTypeId?: number;
// };

type ParkingEditTarievendataProps = {
  parkingID: string;
  editmode: boolean;
  showEdit: boolean;
  onEdit?: () => void;
  onClose: (datahash: string) => void;
  version: string | null;
};

const ParkingEditTarievendata: React.FC<ParkingEditTarievendataProps> = ({
  parkingID,
  editmode,
  showEdit,
  onEdit,
  onClose,
  version,
}) => {
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [newHasUniSectionPrices, setNewHasUniSectionPrices] = useState<boolean | undefined>(undefined);
  const [newHasUniBikeTypePrices, setNewHasUniBikeTypePrices] = useState<boolean | undefined>(undefined);

  const [tarievenData, setTarievendata] = useState<TarievenData | null>(null);
  const [scopeMeta, setScopeMeta] = useState<Record<string, TariffScopeDescriptor>>({});
  const [scopeOrder, setScopeOrder] = useState<string[]>([]);
  const [editableTariffsByScope, setEditableTariffsByScope] = useState<Record<string, EditableTariefRow[]>>({});
  const [originalTariffsByScope, setOriginalTariffsByScope] = useState<Record<string, NormalizedTariffRow[]>>({});
  const [discardedTariffs, setDiscardedTariffs] = useState<NormalizedTariffRow[]>([]);
  const rowKeyCounterRef = useRef(0);
  const focusRestoreRef = useRef<{ scopeKey: string; field: string; rowKey: string } | null>(null);

  const {
    data: sections,
    isLoading: sectionsLoading,
    error: sectionsError,
  } = useSectiesByFietsenstalling(parkingID);

  const {
    data: bikeTypes,
    isLoading: bikeTypesLoading,
    error: bikeTypesError,
  } = useBikeTypes();

  const stallingHasBiketype = (bikeTypeId: number) => {
    for (const section of sections ?? []) {
      const bt = section.secties_fietstype.find(
        (bikeType) => bikeType.BikeTypeID === bikeTypeId,
      );
      if (bt && bt.Toegestaan && typeof bt.SectionBiketypeID === "number") {
        return true;
      }
    }
    return false;
  };

  const bikeTypeNameMap = useMemo(() => {
    return new Map(
      (bikeTypes ?? []).map((bt) => [
        bt.ID,
        bt.Name ?? bt.naamenkelvoud ?? `Fietstype ${bt.ID}`,
      ]),
    );
  }, [bikeTypes]);

  const allocateRowKey = useCallback(() => {
    rowKeyCounterRef.current += 1;
    return rowKeyCounterRef.current.toString();
  }, []);

  const currentHasUniSectionPrices =
    newHasUniSectionPrices !== undefined
      ? newHasUniSectionPrices
      : tarievenData?.hasUniSectionPrices ?? false;
  const currentHasUniBikeTypePrices =
    newHasUniBikeTypePrices !== undefined
      ? newHasUniBikeTypePrices
      : tarievenData?.hasUniBikeTypePrices ?? false;

  const currentFlags = useMemo<TariffFlags>(
    () => ({
      hasUniSectionPrices: currentHasUniSectionPrices,
      hasUniBikeTypePrices: currentHasUniBikeTypePrices,
    }),
    [currentHasUniSectionPrices, currentHasUniBikeTypePrices],
  );


  useEffect(() => {
    if (!parkingID) {
      return;
    }

    let cancelled = false;

    const fetchData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/protected/fietsenstallingen/${parkingID}/tarieven`);
        if (!response.ok) {
          throw new Error("Fout bij het ophalen van tarieven");
        }
        const json = await response.json();
        const tarievenData: TarievenData = json.data;

        if (!cancelled) {
          setTarievendata(tarievenData);
          // setLocalTariffs(groupTariffsByScope(tarievenData.tariffs || []));
        }
      } catch (fetchError) {
        console.error("Error fetching tarieven:", fetchError);
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Fout bij het ophalen van tarieven",
          );
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [parkingID, version]);

  useEffect(() => {
    if (!tarievenData) {
      setScopeMeta({});
      setScopeOrder([]);
      setEditableTariffsByScope({});
      setOriginalTariffsByScope({});
      setDiscardedTariffs([]);
      return;
    }

    const descriptors = buildScopeDescriptors(
      sections ?? [],
      bikeTypeNameMap,
      tarievenData.tariffs ?? [],
      currentFlags,
    );

    const { grouped: groupedOriginal, discarded } = groupTariffsByScope(
      tarievenData.tariffs ?? [],
      currentFlags,
    );

    const descriptorMap: Record<string, TariffScopeDescriptor> = {};
    const editableState: Record<string, EditableTariefRow[]> = {};

    descriptors.forEach((descriptor) => {
      descriptorMap[descriptor.key] = descriptor;
      if (!groupedOriginal[descriptor.key]) {
        groupedOriginal[descriptor.key] = [];
      }
      editableState[descriptor.key] = buildEditableRowsForScope(
        descriptor,
        groupedOriginal[descriptor.key] ?? [],
        allocateRowKey,
      );
    });

    setScopeMeta(descriptorMap);
    setScopeOrder(descriptors.map((descriptor) => descriptor.key));
    setOriginalTariffsByScope(groupedOriginal);
    setEditableTariffsByScope(editableState);
    setDiscardedTariffs(discarded);
  }, [tarievenData, sections, bikeTypeNameMap, currentFlags, allocateRowKey]);

  const formatCurrency = (value: number | null) => {
    if (value === null || value === undefined) {
      return "-";
    }
    return value.toLocaleString("nl-NL", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  };

  const updateEditableTariff = useCallback(
    (
      scopeKey: string,
      rowKey: string,
      field: "tijdsspanne" | "kosten",
      rawValue: string,
    ) => {
      setEditableTariffsByScope((prev) => {
        const rows = prev[scopeKey];
        const scope = scopeMeta[scopeKey];
        if (!rows || !scope) {
          return prev;
        }

        let placeholderConverted = false;
        let newRowKey: string | null = null;

        const updatedRows = rows
          .map((row) => {
            if (row.key !== rowKey) {
              return row;
            }
            const parsedValue = sanitizeNumberInput(rawValue);
            if (row.isPlaceholder) {
              placeholderConverted = true;
              newRowKey = `row-${scope.key}-${allocateRowKey()}`;
              // Store focus restore info for the new row key
              focusRestoreRef.current = { scopeKey, field, rowKey: newRowKey };
              return {
                ...row,
                key: newRowKey,
                isPlaceholder: false,
                isNew: true,
                orderToken: Date.now(),
                [field]: parsedValue,
              };
            }
            return {
              ...row,
              [field]: parsedValue,
            };
          })
          .filter((row) => {
            if (row.isPlaceholder) {
              return true;
            }
            return !(row.tijdsspanne === null && row.kosten === null);
          });

        let rowsWithPlaceholder = updatedRows;

        if (placeholderConverted) {
          rowsWithPlaceholder = [
            ...updatedRows,
            createPlaceholderRow(
              scope,
              updatedRows.filter((row) => !row.isPlaceholder).length + 1,
              allocateRowKey,
            ),
          ];
        }

        const normalizedRows = normalizeEditableScopeRows(
          scope,
          rowsWithPlaceholder,
          allocateRowKey,
        );

        return {
          ...prev,
          [scopeKey]: normalizedRows,
        };
      });
    },
    [scopeMeta, allocateRowKey],
  );

  // Restore focus after state update
  useEffect(() => {
    if (focusRestoreRef.current) {
      const { scopeKey, field, rowKey } = focusRestoreRef.current;
      // Use setTimeout to ensure DOM has updated
      setTimeout(() => {
        const input = document.querySelector(
          `input[data-scope-key="${scopeKey}"][data-row-key="${rowKey}"][data-field="${field}"]`
        ) as HTMLInputElement;
        if (input) {
          input.focus();
          input.select();
        }
        focusRestoreRef.current = null;
      }, 0);
    }
  }, [editableTariffsByScope]);

  const getSectionLabel = (
    scope?: TariffScopeDescriptor,
    row?: NormalizedTariffRow,
  ) => {
    if (scope?.sectionLabel) {
      return scope.sectionLabel;
    }
    if (row?.sectieID) {
      const section = sections?.find(
        (s) => s.sectieId === row.sectieID,
      );
      return section?.titel ?? `Sectie ${row.sectieID}`;
    }
    return row?.sectieID ?? "-";
  };

  const getBikeTypeLabel = (
    scope?: TariffScopeDescriptor,
    row?: NormalizedTariffRow,
  ) => {
    if (scope?.bikeTypeLabel) {
      return scope.bikeTypeLabel;
    }
    if (row?.bikeTypeID !== null && row?.bikeTypeID !== undefined) {
      return (
        bikeTypeNameMap.get(row.bikeTypeID) ??
        `Fietstype ${row.bikeTypeID}`
      );
    }
    return "-";
  };

  const normalizedDraft = useMemo(() => {
    const result: Record<string, NormalizedTariffRow[]> = {};
    Object.entries(editableTariffsByScope).forEach(([scopeKey, rows]) => {
      const scope = scopeMeta[scopeKey];
      if (!scope) {
        result[scopeKey] = [];
        return;
      }
      const actualRows = rows
        .filter((row) => !row.isPlaceholder)
        .map((row, idx) => ({
          scopeKey,
          tariefregelID: row.tariefregelID,
          index: idx + 1,
          tijdsspanne: row.tijdsspanne,
          kosten: row.kosten,
          sectieID:
            scope.scopeType === "section" || scope.scopeType === "bikeType"
              ? row.sectionId ?? scope.sectionId ?? null
              : null,
          sectionBikeTypeID:
            scope.scopeType === "bikeType"
              ? row.sectionBikeTypeId ?? scope.sectionBikeTypeId ?? null
              : null,
          bikeTypeID: row.bikeTypeId ?? scope.bikeTypeId ?? null,
          stallingsID: null,
        }));
      result[scopeKey] = actualRows;
    });
    return result;
  }, [editableTariffsByScope, scopeMeta]);

  const hasInvalidRows = useMemo(
    () =>
      Object.values(editableTariffsByScope).some((rows) =>
        rows.some((row) => isRowInvalid(row)),
      ),
    [editableTariffsByScope],
  );

  const changeLog = useMemo(() => {
    const baseChanges = computeChangeLog(
      originalTariffsByScope,
      normalizedDraft,
      scopeMeta,
    );

    if (!discardedTariffs.length) {
      return baseChanges;
    }

    const discardedScope: TariffScopeDescriptor = {
      key: DISCARDED_SCOPE_KEY,
      scopeType: "stalling",
      label: "Niet toegestaan (verwijderd)",
    };

    const discardedEntries: TariffChangeEntry[] = discardedTariffs.map(
      (row) => ({
        scope: discardedScope,
        type: "verwijderd",
        before: row,
      }),
    );

    return [...baseChanges, ...discardedEntries];
  }, [originalTariffsByScope, normalizedDraft, scopeMeta, discardedTariffs]);

  const flagsChanged =
    (newHasUniSectionPrices !== undefined &&
      newHasUniSectionPrices !== tarievenData?.hasUniSectionPrices) ||
    (newHasUniBikeTypePrices !== undefined &&
      newHasUniBikeTypePrices !== tarievenData?.hasUniBikeTypePrices);

  const lineChangesExist = changeLog.length > 0;

  const proposedTariffsPayload = useMemo(() => {
    const payload: Record<
      string,
      { index: number; tijdsspanne: number | null; kosten: number | null }[]
    > = {};
    const keys = new Set([
      ...scopeOrder,
      ...Object.keys(normalizedDraft),
    ]);
    keys.forEach((scopeKey) => {
      const rows = normalizedDraft[scopeKey] ?? [];
      payload[scopeKey] = rows.map((row, idx) => ({
        index: idx + 1,
        tijdsspanne: row.tijdsspanne,
        kosten: row.kosten,
      }));
    });
    return payload;
  }, [normalizedDraft, scopeOrder]);

  const canSave =
    editmode &&
    !isSaving &&
    !hasInvalidRows &&
    (lineChangesExist || flagsChanged);

  // Helper functions to reduce duplication
  const getFlagValue = (flag: 'section' | 'bikeType'): boolean => {
    const newValue = flag === 'section' ? newHasUniSectionPrices : newHasUniBikeTypePrices;
    const dataValue = flag === 'section' ? tarievenData?.hasUniSectionPrices : tarievenData?.hasUniBikeTypePrices;
    return newValue !== undefined ? newValue : (dataValue ?? false);
  };

  const getSectionName = (sectionId: number): string => {
    const section = sections?.find((s) => s.sectieId === sectionId);
    return section?.titel || `Sectie ${sectionId}`;
  };

  const getBikeTypeName = (bikeTypeId: number, scope?: TariffScopeDescriptor): string => {
    if (scope?.label) return scope.label;
    return bikeTypeNameMap.get(bikeTypeId) || `Fietstype ${bikeTypeId}`;
  };

  const renderEmptyState = (
    message: 'geen_tariefregels' | 'geen_tarieven' = 'geen_tariefregels',
    customClassName?: string
  ) => {
    const text = message === 'geen_tariefregels' 
      ? 'Geen tariefregels beschikbaar voor deze stalling.'
      : 'Er zijn geen tarieven ingesteld voor deze stalling.';
    const defaultClassName = message === 'geen_tarieven' ? 'mt-4' : 'text-sm text-gray-500';
    return (
      <div className={customClassName ?? defaultClassName}>
        {text}
      </div>
    );
  };

  const renderTableWrapper = (children: React.ReactNode) => {
    return (
      <div className="inline-block max-w-full overflow-x-auto">
        <table className="table-auto text-sm whitespace-nowrap">
          <tbody>{children}</tbody>
        </table>
      </div>
    );
  };

  const collectGroupedRows = <T extends number>(
    scopeOrder: string[],
    getId: (scope: TariffScopeDescriptor) => T | null | undefined,
    getName: (id: T, scope: TariffScopeDescriptor) => string,
    groupName: 'bikeTypeName' | 'sectionName'
  ): Array<{
    scopeKey: string;
    bikeTypeName?: string;
    sectionName?: string;
    rows: EditableTariefRow[];
  }> => {
    const allRows: Array<{
      scopeKey: string;
      bikeTypeName?: string;
      sectionName?: string;
      rows: EditableTariefRow[];
    }> = [];
    const seen = new Set<T>();

    for (const scopeKey of scopeOrder) {
      const scope = scopeMeta[scopeKey];
      if (!scope) continue;
      
      const id = getId(scope);
      if (id === null || id === undefined || seen.has(id)) continue;
      
      seen.add(id);
      const rows = editableTariffsByScope[scopeKey] ?? [];
      if (rows.length === 0) continue;

      const name = getName(id, scope);
      const rowEntry: {
        scopeKey: string;
        bikeTypeName?: string;
        sectionName?: string;
        rows: EditableTariefRow[];
      } = {
        scopeKey,
        rows,
      };
      if (groupName === 'bikeTypeName') {
        rowEntry.bikeTypeName = name;
      } else {
        rowEntry.sectionName = name;
      }
      allRows.push(rowEntry);
    }

    return allRows;
  };

  const renderEditableTariffRow = (
    scopeKey: string,
    row: EditableTariefRow,
    showGroupColumn: boolean = false,
    groupName: string = "",
    isFirstRow: boolean = false,
    rowSpan: number = 1,
  ) => {
    const label = row.index === 1 ? "Eerste" : `Volgende`;
    const invalid = isRowInvalid(row);
    return (
      <tr key={row.key} className={row.isPlaceholder ? "text-gray-500" : ""}>
        {showGroupColumn && isFirstRow && (
          <td
            rowSpan={rowSpan}
            className="px-3 font-medium align-middle w-64"
          >
            <div className="flex flex-col gap-1">{groupName}</div>
          </td>
        )}
        <td className="pr-3 align-middle">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-gray-600">
              {label}
            </span>
            {invalid && (
              <span
                className="text-yellow-600"
                title="Vul beide velden in om deze regel op te slaan (tijdsspanne moet groter zijn dan 0)"
              >
                ⚠️
              </span>
            )}
          </div>
        </td>
        <td className="pr-2 align-middle">
          <FormInput
            type="number"
            placeholder="uren"
            value={
              row.tijdsspanne !== null && row.tijdsspanne !== undefined
                ? row.tijdsspanne
                : ""
            }
            onChange={(e) =>
              updateEditableTariff(
                scopeKey,
                row.key,
                "tijdsspanne",
                e.target.value,
              )
            }
            disabled={isSaving}
            className="!w-20 !px-2"
            data-scope-key={scopeKey}
            data-row-key={row.key}
            data-field="tijdsspanne"
          />
        </td>
        <td className="pr-2 align-middle whitespace-nowrap">
          <span className="text-sm text-gray-500">uur = €</span>
        </td>
        <td className="align-middle">
          <FormInput
            type="number"
            placeholder="0,00"
            value={
              row.kosten !== null && row.kosten !== undefined
                ? row.kosten
                : ""
            }
            onChange={(e) =>
              updateEditableTariff(
                scopeKey,
                row.key,
                "kosten",
                e.target.value,
              )
            }
            disabled={isSaving}
            className="!w-24 !px-2"
            data-scope-key={scopeKey}
            data-row-key={row.key}
            data-field="kosten"
          />
        </td>
      </tr>
    );
  };

  const renderEditableScopes = () => {
    if (scopeOrder.length === 0) {
      return renderEmptyState('geen_tariefregels');
    }

    const hasUniSectionPrices = getFlagValue('section');
    const hasUniBikeTypePrices = getFlagValue('bikeType');

    // For "uni sections, non-uni bike types" case, group by bicycle type in a single table
    if (hasUniSectionPrices && !hasUniBikeTypePrices) {
      const allRows = collectGroupedRows(
        scopeOrder,
        (scope) => scope.bikeTypeId ?? null,
        (bikeTypeId, scope) => getBikeTypeName(bikeTypeId, scope),
        'bikeTypeName'
      );

      if (allRows.length === 0) {
        return renderEmptyState('geen_tariefregels');
      }

      return renderTableWrapper(
        allRows.flatMap(({ scopeKey, bikeTypeName, rows }) => {
          return rows.map((row, rowIndex) => {
            const isFirstRow = rowIndex === 0;
            return renderEditableTariffRow(
              scopeKey,
              row,
              true, // showGroupColumn
              bikeTypeName!,
              isFirstRow,
              rows.length, // rowSpan
            );
          });
        })
      );
    }

    // For "non-uni sections, uni bike types" case, group by section in a single table
    if (!hasUniSectionPrices && hasUniBikeTypePrices) {
      const allRows = collectGroupedRows(
        scopeOrder,
        (scope) => scope.sectionId ?? null,
        (sectionId) => getSectionName(sectionId),
        'sectionName'
      );

      if (allRows.length === 0) {
        return renderEmptyState('geen_tariefregels');
      }

      return renderTableWrapper(
        allRows.flatMap(({ scopeKey, sectionName, rows }, groupIndex) => {
          return rows.map((row, rowIndex) => {
            const isFirstRow = rowIndex === 0;
            return renderEditableTariffRow(
              scopeKey,
              row,
              true, // showGroupColumn
              sectionName!,
              isFirstRow,
              rows.length, // rowSpan
            );
          });
        })
      );
    }

    // For "non-uni both" case, group by section first, then by bicycle type
    if (!hasUniSectionPrices && !hasUniBikeTypePrices) {
      // Group scopes by section (order is preserved from scopeOrder)
      const groupedBySection = new Map<number, string[]>();
      for (const scopeKey of scopeOrder) {
        const scope = scopeMeta[scopeKey];
        if (!scope || scope.sectionId === null || scope.sectionId === undefined) continue;
        
        const sectionId = scope.sectionId;
        const existing = groupedBySection.get(sectionId) || [];
        groupedBySection.set(sectionId, [...existing, scopeKey]);
      }

      return (
        <>
          {Array.from(groupedBySection.entries()).map(([sectionId, sectionScopeKeys]) => {
            if (sectionScopeKeys.length === 0) return null;

            const sectionName = getSectionName(sectionId);

            // Collect all rows for all bicycle types in this section (order is preserved from sectionScopeKeys)
            const allRows = collectGroupedRows(
              sectionScopeKeys,
              (scope) => scope.bikeTypeId ?? null,
              (bikeTypeId, scope) => getBikeTypeName(bikeTypeId, scope),
              'bikeTypeName'
            );

            if (allRows.length === 0) return null;

            return (
              <div key={sectionId} className="mb-4">
                <div className="font-semibold mb-2">{sectionName}</div>
                {renderTableWrapper(
                  allRows.flatMap(({ scopeKey, bikeTypeName, rows }, groupIndex) => {
                    return rows.map((row, rowIndex) => {
                      const isFirstRow = rowIndex === 0;
                      return renderEditableTariffRow(
                        scopeKey,
                        row,
                        true, // showGroupColumn
                        bikeTypeName!,
                        isFirstRow,
                        rows.length, // rowSpan
                      );
                    });
                  })
                )}
              </div>
            );
          })}
        </>
      );
    }

    // For other cases, use the original flat rendering
    return scopeOrder.map((scopeKey) => {
      const scope = scopeMeta[scopeKey];
      const rows = editableTariffsByScope[scopeKey] ?? [];
      if (!scope) {
        return null;
      }

      // For "stalling" scope (Alle secties & fietstypen), use same layout as non-uni both (no border)
      if (scope.scopeType === 'stalling') {
        return (
          <div key={scopeKey} className="mb-4">
            <div className="font-semibold mb-2">{scope.label}</div>
            {renderTableWrapper(
              rows.map((row) => renderEditableTariffRow(scopeKey, row))
            )}
          </div>
        );
      }

      return (
        <div
          key={scopeKey}
          className="mb-6 rounded border border-gray-200 p-4"
        >
          <div className="mb-2 flex flex-col">
            <span className="font-semibold text-sm">{scope.label}</span>
          </div>
          {renderTableWrapper(
            rows.map((row) => renderEditableTariffRow(scopeKey, row))
          )}
        </div>
      );
    });
  };

  const getTariffCellContent = (data: TariefRow) => {
    const output = [];

    const hasValue = data.tijdsspanne !== null || data.kosten !== null;
    const label = `${data.index === 1 ? "eerste" : "volgende"} ${data.tijdsspanne} uur = € ${formatCurrency(data.kosten ?? null)}`;
    output.push(hasValue ? (
      <div className="py-2">
        <span>{label}</span>
      </div>
    ) : (
      <div className="py-2">
        <span className="text-gray-400">-</span>
      </div>
    ));

    return output;
  };

  const renderTariffTable = (elements: React.ReactNode[]) => {
    if (elements.length === 0) {
      return null
    }

    return (
      <>
        <div className="overflow-x-auto border border-gray-200 rounded">
          <table className="w-auto text-sm">
            <tbody>
              { elements }
            </tbody>
          </table>
        </div>
        {editmode && (
          <div className="text-xs text-gray-500 mt-2">
            De laatst ingevulde tariefregel wordt na verstrijken steeds
            herhaald.
          </div>
        )}
      </>
    );
  }

  const getTariffTableRows = (
    rows: TariefRow[],
    showHeader: "biketype" | "section" | "none" = "none"
  ): React.ReactNode[] => {
    return rows.map((row, index) => { 
      let headerlabel: string = "";
      switch(showHeader){
        case "biketype": headerlabel = bikeTypeNameMap.get(row.bikeTypeID ?? 0) ?? row.bikeTypeID?.toString() ?? ""; break;
        case "section": headerlabel = sections?.find((section) => section.sectieId === row.sectieID)?.titel ?? row.sectieID?.toString() ?? ""; break;
        default: headerlabel = ""; break;
      }

      return(
        <tr
          key={`${row.tariefregelID}-tariff-${row.index ?? index}`}>
          {showHeader !== "none" && index === 0 && (
            <td
              rowSpan={rows.length}
              className="px-3 font-medium align-top w-64"
            >
              <div className="flex flex-col gap-1">{headerlabel}</div>
            </td>
          )}
          {getTariffCellContent(row).map((content, idx) => (
            <React.Fragment key={idx}>{content}</React.Fragment>
          ))}
        </tr>
      )
    });
  };

  const metadataLoading = sectionsLoading || bikeTypesLoading;
  const combinedError = error || sectionsError || bikeTypesError;

  if (isLoading || metadataLoading) {
    return (
        <LoadingSpinner message="Tarieven laden..." />
    );
  }

  if (combinedError) {
    return (
        <div className="text-red-600">{combinedError}</div>
    );
  }

  // const hasAnyTariffs = Boolean(tarievendata?.tariffs?.length);

  // if (!tarievendata) {
  //   return (
  //       <div className="text-gray-600">Geen tarieven data beschikbaar</div>
  //   );
  // }

  const hasAnyTariffs = Boolean(tarievenData?.tariffs?.length);

  const getCurrentTariffsSorted = (tariffs: TariefRow[], hasUniSectionPrices: boolean = false, hasUniBikeTypePrices: boolean = false) => {
      if(hasUniSectionPrices && hasUniBikeTypePrices) {
        // not checked
        return tariffs?.sort((a, b) => { 
          const valueA = (a.index ?? 0)
          const valueB = (b.index ?? 0)
          return valueA - valueB;
        });  
      } else if (hasUniSectionPrices && !hasUniBikeTypePrices) {
        // checked
        return tariffs?.sort((a, b) => { 
          const valueA = (a.bikeTypeID ?? 0) * 1000 + (a.index ?? 0)
          const valueB = (b.bikeTypeID ?? 0) * 1000 + (b.index ?? 0)
          return valueA - valueB;
        });
      } else if (!hasUniSectionPrices && hasUniBikeTypePrices) {
        return tariffs?.sort((a, b) => { 
          const valueA = (a.sectieID ?? 0) * 1000 + (a.index ?? 0)
          const valueB = (b.sectieID ?? 0) * 1000 + (b.index ?? 0)
          return valueA - valueB;
        });
      } else {
        // not checked
        return tariffs?.sort((a, b) => { 
          const valueA = (a.sectieID ?? 0) * 1000000 + (a.bikeTypeID ?? 0) * 1000 + (a.index ?? 0)
          const valueB = (b.sectieID ?? 0) * 1000000 + (b.bikeTypeID ?? 0) * 1000 + (b.index ?? 0)
          // console.log("SORTING TARIEFS", a.sectieID, a.bikeTypeID, a.index," versus", b.sectieID, b.bikeTypeID, b.index, "gives", valueA - valueB);
          return valueA - valueB;
        });
      }
  }

  const renderUniSectionsUniBT = () => {
    const tariffs = getCurrentTariffsSorted(tarievenData?.tariffs || [],true,true);
    const elements = getTariffTableRows(tariffs, "none");

    return (
      <>
        <div className="mb-2">Tarieven zijn gelijk voor alle sectoren en alle typen tweewieler</div>
        {tariffs.length === 0 && renderEmptyState('geen_tarieven')}
        <div className="mb-4">{renderTariffTable(elements)}</div>
      </>
    );
  }

  const renderUniSections = () => {
    const tariffs = getCurrentTariffsSorted(tarievenData?.tariffs || [], true, false);

    // Group tariffs by bike type ID (order is preserved since tariffs are already sorted by bikeTypeID)
    const groupedTariffs = new Map<number, TariefRow[]>();
    for (const t of tariffs) {
      if (t.bikeTypeID !== null && t.bikeTypeID !== undefined) {
        const existing = groupedTariffs.get(t.bikeTypeID) || [];
        groupedTariffs.set(t.bikeTypeID, [...existing, t]);
      }
    }

    // Build elements array from grouped tariffs (order is preserved from Map iteration)
    const elements: React.ReactNode[] = [];
    for (const [bikeTypeId, bikeTypeTariffs] of groupedTariffs) {
      elements.push(...getTariffTableRows(bikeTypeTariffs, "biketype"));
    }

    return (
      <>
        <div className="mb-2">Tarieven zijn gelijk voor alle sectoren</div>
        {tariffs.length === 0 && renderEmptyState('geen_tarieven')}
        <div className="mb-4">
          { renderTariffTable(elements) }
        </div>
      </>
    );
  }

  const renderUniBT = () => {
    const tariffs = getCurrentTariffsSorted(tarievenData?.tariffs || [], false, true);
    if (!tariffs || tariffs.length === 0) {
      return <div className="mb-2">Tarieven zijn gelijk voor alle typen tweewieler</div>;
    }

    // Group tariffs by section ID (order is preserved since tariffs are already sorted by sectieID)
    const groupedTariffs = new Map<number, TariefRow[]>();
    for (const t of tariffs) {
      if (t.sectieID !== null && t.sectieID !== undefined) {
        const existing = groupedTariffs.get(t.sectieID) || [];
        groupedTariffs.set(t.sectieID, [...existing, t]);
      }
    }

    return (
      <>
        <div className="mb-2">Tarieven zijn gelijk voor alle typen tweewieler</div>
        {Array.from(groupedTariffs.entries()).map(([sectionId, sectionTariffs]) => {
          if (!sectionTariffs || sectionTariffs.length === 0) return null;
          
          const sectionName = getSectionName(sectionId);
          const elements = getTariffTableRows(sectionTariffs, "none");
          
          return (
            <div key={sectionId} className="mb-4">
              <div className="font-semibold mb-2">{sectionName}</div>
              {renderTableWrapper(elements)}
            </div>
          );
        })}
      </>
    );
  }

  const renderNonUni = () => {
    const tariffs = getCurrentTariffsSorted(tarievenData?.tariffs || [], false, false);

    // Group tariffs by section ID, then by bike type ID within each section
    // Order is preserved since tariffs are already sorted by (sectieID, bikeTypeID, index)
    const groupedBySection = new Map<number, Map<number, TariefRow[]>>();
    for (const t of tariffs) {
      if (t.sectieID === null || t.sectieID === undefined) continue;
      const sectionId = t.sectieID;
      
      if (!groupedBySection.has(sectionId)) {
        groupedBySection.set(sectionId, new Map());
      }
      
      if (t.bikeTypeID !== null && t.bikeTypeID !== undefined) {
        const bikeTypeId = t.bikeTypeID;
        const sectionGroup = groupedBySection.get(sectionId)!;
        const existing = sectionGroup.get(bikeTypeId) || [];
        sectionGroup.set(bikeTypeId, [...existing, t]);
      }
    }

    return (
      <>
        <div className="mb-2">Verschillend voor sectoren en typen tweewieler</div>
        {Array.from(groupedBySection.entries()).map(([sectionId, sectionGroup]) => {
          const sectionName = getSectionName(sectionId);

          // Collect all elements for this section (order is preserved from Map iteration)
          let elements: React.ReactNode[] = [];
          for (const [bikeTypeId, bikeTypeTariffs] of sectionGroup) {
            if (!bikeTypeTariffs || bikeTypeTariffs.length === 0) continue;
            elements.push(...getTariffTableRows(bikeTypeTariffs, "biketype"));
          }

          if (elements.length === 0) return null;

          return (
            <div key={sectionId} className="mb-4">
              <div className="font-semibold mb-2">{sectionName}</div>
              {renderTariffTable(elements)}
            </div>
          );
        })}
      </>
    );
  }

  const renderTariffs = () => {
    const hasUniSectionPrices = getFlagValue('section');
    const hasUniBikeTypePrices = getFlagValue('bikeType');

    let elements: React.JSX.Element | undefined= undefined;
    if(hasUniSectionPrices) {
      elements = hasUniBikeTypePrices?renderUniSectionsUniBT():renderUniSections();
    } else {
      elements = hasUniBikeTypePrices?renderUniBT():renderNonUni();
    }

    return elements;
  }

  const renderView = () => {
    return (
      <>
        {!hasAnyTariffs ? (
          renderEmptyState('geen_tarieven', 'mb-4 text-gray-600 border-2')
        ) : (
          renderTariffs()
        )}
        {showEdit && (
          <div className="mt-4">
            <Button onClick={onEdit}>
              Bewerken
            </Button>
          </div>
        )}
      </>
    );
  };

  const renderEdit = () => {
    return (
      <>
        {/* Header with title and buttons - matching ParkingEdit style */}
        <div className="flex justify-between sm:mr-8 mb-4">
          <PageTitle className="flex w-full justify-center sm:justify-start">
            <div className="mr-4 hidden sm:block">
              Bewerk tarieven
            </div>
            <Button
              key="b-1"
              className={`mt-3 sm:mt-0 ${!canSave ? "opacity-50 cursor-not-allowed pointer-events-none" : ""}`}
              onClick={canSave ? handleSaveEdit : undefined}
            >
              Opslaan
            </Button>
            <Button
              key="b-2"
              className="ml-6 mt-3 sm:mt-0"
              variant="secundary"
              onClick={handleCancelEdit}
            >
              Annuleer
            </Button>
          </PageTitle>
        </div>

        <div className="flex flex-col gap-2">
          <FormControlLabel
            control={
              <Checkbox
                checked={
                  newHasUniSectionPrices !== undefined
                    ? newHasUniSectionPrices
                    : tarievenData?.hasUniSectionPrices ?? false
                }
                onChange={(e) => {
                  setNewHasUniSectionPrices(e.target.checked);
                }}
              />
            }
            label="Tarieven gelijk voor alle sectoren"
          />
          <FormControlLabel
            control={
              <Checkbox
                checked={
                  newHasUniBikeTypePrices !== undefined
                    ? newHasUniBikeTypePrices
                    : tarievenData?.hasUniBikeTypePrices ?? false
                }
                onChange={(e) => {
                  setNewHasUniBikeTypePrices(e.target.checked);
                }}
              />
            }
            label="Tarieven gelijk voor alle typen tweewieler"
          />
        </div>

        {discardedTariffs.length > 0 && (
          <div className="mt-3 rounded border border-amber-300 bg-amber-50 p-3 text-xs text-amber-800">
            {discardedTariffs.length} tariefregel
            {discardedTariffs.length === 1 ? "" : "s"} passen niet bij de
            huidige instellingen en worden verwijderd bij het opslaan.
          </div>
        )}

        <div className="mt-4">{renderEditableScopes()}</div>

        {hasInvalidRows && (
          <div className="mt-2 text-xs text-red-600">
            Er zijn regels met ongeldige waarden. Vul beide velden in (tijdsspanne moet groter zijn dan 0) of laat
            de regel volledig leeg om deze te verwijderen.
          </div>
        )}
      </>
    );
  };

  const handleCancelEdit = () => {
    onClose(Date.now().toString());
  };

  const handleSaveEdit = async () => {
    if (!editmode || !tarievenData) {
      return;
    }

    if (!canSave) {
      return;
    }

    if (hasInvalidRows) {
      setError("Los alle waarschuwingen op voordat u opslaat.");
      return;
    }

    if (!lineChangesExist && !flagsChanged) {
      setError("Er zijn geen wijzigingen om op te slaan.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const currentHasUniSectionPrices = tarievenData.hasUniSectionPrices;
      const currentHasUniBikeTypePrices = tarievenData.hasUniBikeTypePrices;

      const sectionFlagChanged =
        newHasUniSectionPrices !== undefined &&
        newHasUniSectionPrices !== currentHasUniSectionPrices;
      const bikeTypeFlagChanged =
        newHasUniBikeTypePrices !== undefined &&
        newHasUniBikeTypePrices !== currentHasUniBikeTypePrices;

      const payload: {
        hasUniSectionPrices?: boolean;
        hasUniBikeTypePrices?: boolean;
        tariffs?: Record<
          string,
          { index: number; tijdsspanne: number | null; kosten: number | null }[]
        >;
      } = {};

      if (sectionFlagChanged) {
        payload.hasUniSectionPrices = newHasUniSectionPrices;
      }
      if (bikeTypeFlagChanged) {
        payload.hasUniBikeTypePrices = newHasUniBikeTypePrices;
      }

      if (lineChangesExist || sectionFlagChanged || bikeTypeFlagChanged) {
        payload.tariffs = proposedTariffsPayload;
      }

      if (!sectionFlagChanged && !bikeTypeFlagChanged && !lineChangesExist) {
        setIsSaving(false);
        setError("Er zijn geen wijzigingen om op te slaan.");
        return;
      }

      const response = await fetch(
        `/api/protected/fietsenstallingen/${parkingID}/tarieven`,
        {
          method: "PUT",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        },
      );

      const result = await response.json().catch(() => null);
      if (!response.ok) {
        throw new Error(result?.error || "Fout bij het opslaan van de tarieven");
      }

      if (result?.data) {
        setTarievendata(result.data);
      } else {
        setTarievendata({
          ...tarievenData,
          hasUniSectionPrices:
            payload.hasUniSectionPrices ?? currentHasUniSectionPrices,
          hasUniBikeTypePrices:
            payload.hasUniBikeTypePrices ?? currentHasUniBikeTypePrices,
        });
      }
      setNewHasUniSectionPrices(undefined);
      setNewHasUniBikeTypePrices(undefined);

      const newVersion = Date.now().toString();
      onClose(newVersion);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Fout bij het opslaan van de tarieven");
    } finally {
      setIsSaving(false);
    }
  };

  return editmode ? renderEdit() : renderView();
};

export default ParkingEditTarievendata;