import React, { useEffect, useMemo, useState } from "react";
import { Table } from "~/components/common/Table";
import type { ContactpersonWithStallingen } from "~/pages/api/protected/contactpersonen";
import { notifySuccess } from "~/utils/client/notifications";

const FREQUENTIE_OPTIONS = [
  "Elk kwartaal",
  "Elk halfjaar",
  "Elk jaar",
  "Elke 2 jaar",
  "Nooit",
] as const;

type FrequentieOption = (typeof FREQUENTIE_OPTIONS)[number];

type MailfrequentieRow = {
  contactId: string;
  dataEigenaar: string;
  contactpersoonId: string;
  contactpersoonNaam: string;
};

const DEFAULT_FREQUENTIE: FrequentieOption = "Elk jaar";

function getContactpersoonNaam(contactpersoon: ContactpersonWithStallingen): string {
  return contactpersoon.DisplayName?.trim() || contactpersoon.UserName;
}

function isFrequentieOption(value: unknown): value is FrequentieOption {
  return typeof value === "string" && FREQUENTIE_OPTIONS.includes(value as FrequentieOption);
}

const MailfrequentieContactpersonen: React.FC = () => {
  const [rows, setRows] = useState<MailfrequentieRow[]>([]);
  const [frequenties, setFrequenties] = useState<Record<string, FrequentieOption>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchContactpersonen = async () => {
      setLoading(true);
      setError(null);
      try {
        const [contactpersonenRes, frequentieRes] = await Promise.all([
          fetch("/api/protected/contactpersonen"),
          fetch("/api/protected/contactpersonen/mailfrequentie"),
        ]);
        const contactpersonenJson = (await contactpersonenRes.json()) as {
          data?: ContactpersonWithStallingen[];
          error?: string;
        };
        const frequentieJson = (await frequentieRes.json()) as {
          data?: Record<string, string>;
          error?: string;
        };
        if (!contactpersonenRes.ok) {
          throw new Error(contactpersonenJson.error ?? "Fout bij ophalen van contactpersonen");
        }
        if (!frequentieRes.ok) {
          throw new Error(frequentieJson.error ?? "Fout bij ophalen van mailfrequentie");
        }

        const savedFrequenties: Record<string, FrequentieOption> = {};
        for (const [contactId, value] of Object.entries(frequentieJson.data ?? {})) {
          if (isFrequentieOption(value)) {
            savedFrequenties[contactId] = value;
          }
        }

        const groupedByDataEigenaar = new Map<string, ContactpersonWithStallingen[]>();
        for (const item of contactpersonenJson.data ?? []) {
          const list = groupedByDataEigenaar.get(item.ContactID) ?? [];
          list.push(item);
          groupedByDataEigenaar.set(item.ContactID, list);
        }

        const nextRows: MailfrequentieRow[] = [];
        for (const [contactId, personen] of groupedByDataEigenaar.entries()) {
          const sortedPersonen = [...personen].sort((a, b) =>
            getContactpersoonNaam(a).localeCompare(getContactpersoonNaam(b), "nl", {
              sensitivity: "base",
            })
          );
          const first = sortedPersonen[0];
          if (!first) continue;

          nextRows.push({
            contactId,
            dataEigenaar: first.ContactName ?? first.ContactID,
            contactpersoonId: first.UserID,
            contactpersoonNaam: getContactpersoonNaam(first),
          });
        }

        nextRows.sort((a, b) =>
          a.dataEigenaar.localeCompare(b.dataEigenaar, "nl", { sensitivity: "base" })
        );
        setRows(nextRows);
        setFrequenties(() => {
          const next = { ...savedFrequenties };
          for (const row of nextRows) {
            next[row.contactId] = next[row.contactId] ?? DEFAULT_FREQUENTIE;
          }
          return next;
        });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Onbekende fout");
      } finally {
        setLoading(false);
      }
    };

    void fetchContactpersonen();
  }, []);

  const saveFrequenties = async (next: Record<string, FrequentieOption>) => {
    const res = await fetch("/api/protected/contactpersonen/mailfrequentie", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(next),
    });
    const json = (await res.json()) as { error?: string };
    if (!res.ok) {
      throw new Error(json.error ?? "Fout bij opslaan van mailfrequentie");
    }
  };

  const columns = useMemo(
    () => [
      {
        header: "Data-eigenaar",
        accessor: (row: MailfrequentieRow) => (
          <a
            href={`/beheer/contactsgemeenten/${row.contactId}`}
            className="text-blue-600 hover:underline"
          >
            {row.dataEigenaar}
          </a>
        ),
      },
      {
        header: "Contactpersoon",
        accessor: (row: MailfrequentieRow) => (
          <a
            href={`/beheer/usersgebruikersbeheerfietsberaad/${row.contactpersoonId}`}
            className="text-blue-600 hover:underline"
          >
            {row.contactpersoonNaam}
          </a>
        ),
      },
      {
        header: "Frequentie",
        accessor: (row: MailfrequentieRow) => (
          <select
            value={frequenties[row.contactId] ?? DEFAULT_FREQUENTIE}
            onChange={async (event) => {
              const newValue = event.target.value as FrequentieOption;
              const previousValue = frequenties[row.contactId] ?? DEFAULT_FREQUENTIE;
              const next = { ...frequenties, [row.contactId]: newValue };
              setFrequenties(next);
              try {
                await saveFrequenties(next);
                notifySuccess(
                  `Frequentie van ${row.dataEigenaar} geupdate naar ${newValue.toLowerCase()}`
                );
              } catch (e) {
                setFrequenties((prev) => ({ ...prev, [row.contactId]: previousValue }));
                setError(e instanceof Error ? e.message : "Onbekende fout");
              }
            }}
            className="rounded-md border border-gray-300 px-2 py-1 text-sm"
          >
            {FREQUENTIE_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        ),
      },
    ],
    [frequenties]
  );

  if (loading) {
    return (
      <div className="p-6">
        <h1 className="text-3xl font-bold mb-4">Mailfrequentie contactpersonen</h1>
        <p className="text-gray-600">Gegevens laden...</p>
      </div>
    );
  }

  return (
    <div className="p-6">
      <h1 className="text-3xl font-bold mb-4">Mailfrequentie contactpersonen</h1>
      <p className="text-gray-600 mb-6">
        Bepaal op deze pagina per data-eigenaar wat de tijd is tussen laatste datacontrole en
        het verzenden van een automatische datakwaliteitcontrole-mail.
      </p>

      {error && (
        <div className="mb-4 rounded-md bg-red-50 p-4 text-sm text-red-800">{error}</div>
      )}

      <Table columns={columns} data={rows} />
    </div>
  );
};

export default MailfrequentieContactpersonen;
