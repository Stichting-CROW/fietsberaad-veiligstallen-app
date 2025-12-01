import React, { useEffect, useMemo, useRef, useState } from "react";
import { getStartEndDT } from "./ReportsDateFunctions";
import type { PeriodPreset, ReportState } from "./ReportsFilter";

interface PeriodSelectorProps {
  firstDate: Date;
  lastDate: Date;
  currentState?: ReportState;
  onSelectPreset: (preset: PeriodPreset) => void;
  onCustomRangeChange: (start: Date, end: Date) => void;
}

const PRESETS: Array<{ id: PeriodPreset; label: string }> = [
  { id: "deze_week", label: "Deze week" },
  { id: "deze_maand", label: "Deze maand" },
  { id: "dit_kwartaal", label: "Dit kwartaal" },
  { id: "dit_jaar", label: "Dit jaar" },
  { id: "afgelopen_7_dagen", label: "Afgelopen 7 dagen" },
  { id: "afgelopen_30_dagen", label: "Afgelopen 30 dagen" },
  { id: "afgelopen_12_maanden", label: "Afgelopen 12 maanden" },
  { id: "alles", label: "Alle data" },
];

const formatDateForInput = (date: Date | undefined) => {
  if (!date || Number.isNaN(date.getTime())) return "";
  const year = date.getFullYear();
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  return `${year}-${month}-${day}`;
};

const formatDateForLabel = (date: Date | undefined) => {
  if (!date || Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("nl-NL", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
};

const PeriodSelector: React.FC<PeriodSelectorProps> = ({
  firstDate,
  lastDate,
  currentState,
  onSelectPreset,
  onCustomRangeChange,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [draftStart, setDraftStart] = useState<string>("");
  const [draftEnd, setDraftEnd] = useState<string>("");
  const containerRef = useRef<HTMLDivElement>(null);

  const resolvedRange = useMemo(() => {
    if (!currentState) {
      return { start: undefined, end: undefined };
    }

    if (currentState.reportRangeUnit === "range_custom") {
      const start = currentState.customStartDate ? new Date(currentState.customStartDate) : undefined;
      const end = currentState.customEndDate ? new Date(currentState.customEndDate) : undefined;
      return { start, end };
    }

    const { startDT, endDT } = getStartEndDT(
      currentState,
      new Date(firstDate),
      new Date(lastDate)
    );
    return { start: startDT, end: endDT };
  }, [currentState, firstDate, lastDate]);

  useEffect(() => {
    setDraftStart(formatDateForInput(resolvedRange.start));
    setDraftEnd(formatDateForInput(resolvedRange.end));
  }, [
    resolvedRange.start?.toISOString(),
    resolvedRange.end?.toISOString(),
  ]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);

    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [isOpen]);

  const activePresetLabel = currentState
    ? PRESETS.find((preset) => preset.id === currentState.activePreset)?.label
    : undefined;

  const dateRangeLabel = useMemo(() => {
    if (!resolvedRange.start || !resolvedRange.end) {
      return "Selecteer periode";
    }

    const startLabel = formatDateForLabel(resolvedRange.start);
    const endLabel = formatDateForLabel(resolvedRange.end);

    if (startLabel === endLabel) {
      return startLabel;
    }

    return `${startLabel} - ${endLabel}`;
  }, [resolvedRange.start, resolvedRange.end]);

  const buttonLabel = activePresetLabel
    ? <>
      <span className="font-bold">{activePresetLabel}</span> · {dateRangeLabel}
    </>
    : dateRangeLabel;

  const handlePresetClick = (preset: PeriodPreset) => {
    onSelectPreset(preset);
    setIsOpen(false);
  };

  const handleApplyCustomRange = () => {
    if (!draftStart || !draftEnd) {
      return;
    }

    const start = new Date(`${draftStart}T00:00:00`);
    const end = new Date(`${draftEnd}T00:00:00`);

    onCustomRangeChange(start, end);
    setIsOpen(false);
  };

  const isCustomRangeInvalid =
    !draftStart ||
    !draftEnd ||
    Number.isNaN(new Date(draftStart).getTime()) ||
    Number.isNaN(new Date(draftEnd).getTime()) ||
    new Date(draftStart) > new Date(draftEnd);

  return (
    <div className="relative inline-block text-left" ref={containerRef}>
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
      >
        🗓️ <span className="hidden md:inline">{buttonLabel}</span>
        <span className="md:hidden">{activePresetLabel ?? "Periode"}</span>
        <svg
          className={`h-4 w-4 text-gray-500 transition-transform ${isOpen ? "rotate-180" : "rotate-0"}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute right-0 z-30 mt-2 w-[320px] md:w-[600px] origin-top-right rounded-lg border border-gray-200 bg-white shadow-lg">
          <div className="grid grid-cols-1 md:grid-cols-[200px_1fr]">
            <div className="border-b border-gray-200 p-4 md:border-b-0 md:border-r">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Voorinstellingen
              </div>
              <div className="flex flex-col gap-2">
                {PRESETS.map((preset) => {
                  const isActive = currentState?.activePreset === preset.id;

                  return (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => handlePresetClick(preset.id)}
                      className={`w-full rounded-md border px-3 py-2 text-left text-sm transition focus:outline-none focus:ring-2 focus:ring-blue-500 ${
                        isActive
                          ? "border-blue-200 bg-blue-50 text-blue-700"
                          : "border-gray-200 hover:border-blue-200 hover:bg-blue-50"
                      }`}
                    >
                      {preset.label}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="p-4">
              <div className="mb-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Handmatige selectie
              </div>
              <div className="flex flex-col gap-3">
                <label className="flex flex-col text-sm text-gray-700">
                  <span className="mb-1 font-medium">Van</span>
                  <input
                    type="date"
                    value={draftStart}
                    onChange={(event) => setDraftStart(event.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    max={draftEnd || formatDateForInput(lastDate)}
                    min={formatDateForInput(firstDate)}
                  />
                </label>
                <label className="flex flex-col text-sm text-gray-700">
                  <span className="mb-1 font-medium">Tot en met</span>
                  <input
                    type="date"
                    value={draftEnd}
                    onChange={(event) => setDraftEnd(event.target.value)}
                    className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-200"
                    min={draftStart || formatDateForInput(firstDate)}
                    max={formatDateForInput(lastDate)}
                  />
                </label>
                <button
                  type="button"
                  onClick={handleApplyCustomRange}
                  disabled={isCustomRangeInvalid}
                  className={`inline-flex items-center justify-center rounded-md px-3 py-2 text-sm font-medium text-white focus:outline-none focus:ring-2 focus:ring-blue-400 ${
                    isCustomRangeInvalid
                      ? "cursor-not-allowed bg-blue-200"
                      : "bg-blue-600 hover:bg-blue-700"
                  }`}
                >
                  Pas toe
                </button>
                {isCustomRangeInvalid && (
                  <p className="text-xs text-red-500">
                    Kies een geldige begin- en einddatum.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default PeriodSelector;

