import React, { useState, useEffect } from "react";
import type { VSBarcodereeksApi } from "~/types/barcodereeksen";
import type { BarcodereeksType } from "~/types/barcodereeksen";
import { Button } from "~/components/Button";
import Modal from "~/components/Modal";
import FormInput from "~/components/Form/FormInput";

export type BarcodereeksModalMode =
  | { mode: "create"; suggestedRangeStart: string }
  | { mode: "uitgifte"; parent: VSBarcodereeksApi }
  | { mode: "edit"; row: VSBarcodereeksApi };

interface BarcodereeksModalProps {
  type: BarcodereeksType;
  typeLabel: string;
  content: BarcodereeksModalMode;
  onClose: () => void;
  onSaved: (newId?: number) => void;
  onError: (s: string | null) => void;
}

export function BarcodereeksModal({
  type,
  typeLabel,
  content,
  onClose,
  onSaved,
  onError,
}: BarcodereeksModalProps) {
  const isEdit = content.mode === "edit";
  const isUitgifte = content.mode === "uitgifte";
  const isCreate = content.mode === "create";

  const parent = isUitgifte ? content.parent : null;
  const row = isEdit ? content.row : null;
  const suggestedRangeStart = isCreate ? content.suggestedRangeStart : "";

  const parentStart = parent ? BigInt(parent.rangeStart) : BigInt(0);
  const parentEnd = parent ? BigInt(parent.rangeEnd) : BigInt(0);
  const maxAmount = parent ? parent.totaal : null;

  const [label, setLabel] = useState("");
  const [material, setMaterial] = useState("");
  const [printSample, setPrintSample] = useState("");
  const [rangeStart, setRangeStart] = useState("");
  const [amount, setAmount] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit && row) {
      setLabel(row.label ?? "");
      setMaterial(row.material ?? "");
      setPrintSample(row.printSample ?? "");
      setRangeStart(row.rangeStart);
      const start = BigInt(row.rangeStart);
      const end = BigInt(row.rangeEnd);
      if (end >= start) setAmount(String(Number(end - start + BigInt(1))));
      setRangeEnd(row.rangeEnd);
    } else if (isUitgifte && parent) {
      setLabel("");
      setMaterial(parent.material ?? "");
      setPrintSample(parent.printSample ?? "");
      setRangeStart(parent.rangeStart);
      setAmount("");
      setRangeEnd("");
    } else if (isCreate) {
      setLabel("");
      setMaterial("");
      setPrintSample("");
      setRangeStart(suggestedRangeStart);
      setAmount("");
      setRangeEnd("");
    }
  }, [content.mode, row?.ID, parent?.ID, suggestedRangeStart]);

  useEffect(() => {
    if (parent) {
      setMaterial(parent.material ?? "");
      setPrintSample(parent.printSample ?? "");
      setRangeStart(parent.rangeStart);
    }
  }, [parent?.ID, parent?.material, parent?.printSample, parent?.rangeStart]);

  const handleAmountChange = (value: string) => {
    const digitsOnly = value.replace(/[^0-9]/g, "");
    setAmount(digitsOnly);
    const n = parseInt(digitsOnly, 10);
    if (!isNaN(n) && n >= 1 && (!maxAmount || n <= maxAmount)) {
      try {
        const start = BigInt(rangeStart || "0");
        const end = start + BigInt(n) - BigInt(1);
        setRangeEnd(String(end));
      } catch {
        // ignore
      }
    }
  };

  const handleRangeEndChange = (value: string) => {
    const digitsOnly = value.replace(/[^0-9]/g, "");
    setRangeEnd(digitsOnly);
    const trimmed = digitsOnly.trim();
    if (trimmed === "") return;
    try {
      const start = BigInt(rangeStart || "0");
      const end = BigInt(trimmed);
      if (end >= start) {
        const n = Number(end - start + BigInt(1));
        if (n >= 1 && (!maxAmount || n <= maxAmount)) setAmount(String(n));
      }
    } catch {
      // ignore
    }
  };

  const handleRangeStartChange = (value: string) => {
    const digitsOnly = value.replace(/[^0-9]/g, "");
    setRangeStart(digitsOnly);
    if (digitsOnly === "") return;
    try {
      const start = BigInt(digitsOnly);
      if (amount.trim() !== "") {
        const n = parseInt(amount, 10);
        if (!isNaN(n) && n >= 1 && (!maxAmount || n <= maxAmount)) {
          setRangeEnd(String(start + BigInt(n) - BigInt(1)));
        }
      } else if (rangeEnd.trim() !== "") {
        const end = BigInt(rangeEnd.trim());
        if (end >= start) setAmount(String(Number(end - start + BigInt(1))));
      }
    } catch {
      // ignore
    }
  };

  let amountFromRange: number | null = null;
  let validRange = false;
  try {
    if (rangeStart.trim() !== "" && rangeEnd.trim() !== "") {
      const start = BigInt(rangeStart.trim());
      const end = BigInt(rangeEnd.trim());
      if (end >= start) {
        amountFromRange = Number(end - start + BigInt(1));
        if (isUitgifte) {
          validRange =
            amountFromRange >= 1 &&
            amountFromRange <= parent!.totaal &&
            end <= parentEnd &&
            start >= parentStart;
        } else {
          validRange = amountFromRange >= 1;
        }
      }
    }
  } catch {
    // invalid
  }

  const remainingStart =
    validRange && isUitgifte
      ? String(BigInt(rangeEnd.trim()) + BigInt(1))
      : parent?.rangeStart ?? "";
  const voorraadreeksLabel = parent?.label ?? "—";
  const voorraadreeksRange =
    validRange && isUitgifte
      ? `Range: ${remainingStart} t/m ${parent!.rangeEnd}`
      : parent
        ? `Range: ${parent.rangeStart} t/m ${parent.rangeEnd}`
        : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEdit) {
      if (!validRange || amountFromRange == null) {
        const msg =
          rangeEnd.trim() === "" && (amount === "" || isNaN(parseInt(amount, 10)))
            ? "Vul aantal passen of eind range in."
            : "Start range mag niet groter zijn dan eind range.";
        setError(msg);
        onError(msg);
        return;
      }
    } else if (isUitgifte) {
      if (!validRange || amountFromRange == null) {
        const msg =
          rangeEnd.trim() === "" && (amount === "" || isNaN(parseInt(amount, 10)))
            ? "Vul aantal passen of eind range in."
            : `Eind range moet tussen ${parent!.rangeStart} en ${parent!.rangeEnd} liggen (1–${parent!.totaal} passen).`;
        setError(msg);
        onError(msg);
        return;
      }
    } else {
      if (!validRange || amountFromRange == null) {
        const msg =
          rangeEnd.trim() === "" && (amount === "" || isNaN(parseInt(amount, 10)))
            ? "Vul aantal passen of eind range in."
            : "Start range mag niet groter zijn dan eind range.";
        setError(msg);
        onError(msg);
        return;
      }
    }

    setSaving(true);
    setError(null);
    onError(null);
    try {
      if (isEdit && row) {
        const res = await fetch(`/api/protected/barcodereeksen/${row.ID}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            label: label || null,
            material: material || null,
            printSample: printSample || null,
            rangeStart: rangeStart.trim(),
            rangeEnd: rangeEnd.trim(),
          }),
        });
        const json = await res.json();
        if (res.ok) {
          onSaved();
        } else {
          const msg = json.error || "Fout bij opslaan";
          setError(msg);
          onError(msg);
        }
      } else if (isUitgifte && parent) {
        const res = await fetch("/api/protected/barcodereeksen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            parentID: parent.ID,
            rangeStart: rangeStart.trim(),
            rangeEnd: rangeEnd.trim(),
            label: label || null,
            material: material || null,
            printSample: printSample || null,
          }),
        });
        const json = await res.json();
        if (res.ok) {
          onSaved();
        } else {
          const msg = json.error || "Fout bij opslaan";
          setError(msg);
          onError(msg);
        }
      } else {
        const res = await fetch("/api/protected/barcodereeksen", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            type,
            label: label || null,
            material: material || null,
            printSample: printSample || null,
            rangeStart: rangeStart || "0",
            rangeEnd: rangeEnd || "0",
          }),
        });
        const json = await res.json();
        if (res.ok) {
          const created = json.data as { ID?: number };
          onSaved(created?.ID);
        } else {
          const msg = json.error || "Fout bij opslaan";
          setError(msg);
          onError(msg);
        }
      }
    } catch {
      const msg = "Fout bij opslaan";
      setError(msg);
      onError(msg);
    } finally {
      setSaving(false);
    }
  };

  const heading = isEdit
    ? `Reeks bewerken ${typeLabel}`
    : isUitgifte
      ? `Nieuwe subreeks ${typeLabel} (uitgifte vanuit voorraad)`
      : `Nieuwe reeks ${typeLabel}`;
  const amountLabel = isUitgifte ? `Aantal passen (max ${parent!.totaal})` : "Aantal passen";
  const rangeEndLabel = isUitgifte ? `End range (max ${parent!.rangeEnd})` : "End range";
  const canSubmit =
    isEdit ? validRange && amountFromRange != null : validRange && amountFromRange != null;

  return (
    <Modal onClose={onClose} clickOutsideClosesDialog={false}>
      <div>
        <h2 className="font-bold mb-4">{heading}</h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-2 bg-red-100 border border-red-400 text-red-700 rounded text-sm">
              {error}
            </div>
          )}
          {isUitgifte && (
            <div className="text-sm text-gray-700">
              <span className="font-medium">Voorraadreeks:</span> {voorraadreeksLabel} |{" "}
              {voorraadreeksRange}
            </div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">
              {isUitgifte ? "Label (optioneel)" : "Label"}
            </label>
            <FormInput
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              className="border-gray-700 rounded-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Materiaal</label>
            <FormInput
              value={material}
              onChange={(e) => setMaterial(e.target.value)}
              className="border-gray-700 rounded-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Drukproef</label>
            <FormInput
              value={printSample}
              onChange={(e) => setPrintSample(e.target.value)}
              className="border-gray-700 rounded-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Start range</label>
            <FormInput
              type="text"
              value={rangeStart}
              onChange={(e) => handleRangeStartChange(e.target.value)}
              className="border-gray-700 rounded-full"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{amountLabel}</label>
            <FormInput
              type="text"
              inputMode="numeric"
              value={amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              className="border-gray-700 rounded-full"
              placeholder={maxAmount ? `1–${maxAmount}` : undefined}
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">{rangeEndLabel}</label>
            <FormInput
              type="text"
              value={rangeEnd}
              onChange={(e) => handleRangeEndChange(e.target.value)}
              className="border-gray-700 rounded-full"
              placeholder={parent?.rangeEnd}
            />
          </div>
          <div className="flex gap-2">
            <Button disabled={saving || !canSubmit}>{saving ? "Bezig..." : "Opslaan"}</Button>
            <Button onClick={onClose}>Afbreken</Button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
