import React from "react";
import SectionBlock from "~/components/SectionBlock";
import type { ParkingDetailsType } from "~/types/parking";
import TipTapEditor from "~/components/common/TipTapEditor";

type Props = {
  parkingdata: ParkingDetailsType;
  /** Verwijssysteem checkboxes, nota, bron bezettingsdata */
  canEditFlags: boolean;
  /** Rich HTML for diashow type Bikepark */
  canEditDia: boolean;
  newVerwijssysteem: boolean | undefined;
  setNewVerwijssysteem: (v: boolean) => void;
  newVerwijssysteemOverzichten: boolean | undefined;
  setNewVerwijssysteemOverzichten: (v: boolean) => void;
  newNotaVerwijssysteem: string | undefined;
  setNewNotaVerwijssysteem: (v: string) => void;
  newBronBezettingsdata: string | undefined;
  setNewBronBezettingsdata: (v: string) => void;
  newDia: string | undefined;
  setNewDia: (v: string) => void;
};

/** Sources that have delivered occupation data for this stalling, or null while loading. */
function useOccupationSources(parkingId: string | undefined): string[] | null {
  const [sources, setSources] = React.useState<string[] | null>(null);
  React.useEffect(() => {
    if (!parkingId || parkingId === "new") {
      setSources([]);
      return;
    }
    let cancelled = false;
    fetch(`/api/protected/fietsenstallingen/${parkingId}/bezettingsbronnen`)
      .then((res) => (res.ok ? res.json() : { data: [] }))
      .then((json: { data?: string[] }) => {
        if (!cancelled) setSources(json.data ?? []);
      })
      .catch(() => {
        if (!cancelled) setSources([]);
      });
    return () => {
      cancelled = true;
    };
  }, [parkingId]);
  return sources;
}

const ParkingEditVerwijssysteem: React.FC<Props> = ({
  parkingdata,
  canEditFlags,
  canEditDia,
  newVerwijssysteem,
  setNewVerwijssysteem,
  newVerwijssysteemOverzichten,
  setNewVerwijssysteemOverzichten,
  newNotaVerwijssysteem,
  setNewNotaVerwijssysteem,
  newBronBezettingsdata,
  setNewBronBezettingsdata,
  newDia,
  setNewDia,
}) => {
  const verwijssysteem = newVerwijssysteem ?? parkingdata.Verwijssysteem ?? false;
  const overzichten = newVerwijssysteemOverzichten ?? parkingdata.VerwijssysteemOverzichten ?? false;
  const nota = newNotaVerwijssysteem ?? parkingdata.NotaVerwijssysteem ?? "";
  const bron = (newBronBezettingsdata ?? parkingdata.BronBezettingsdata ?? "").trim();
  const bronLabel = bron === "" ? "(geen)" : bron;
  const dia = newDia ?? parkingdata.dia ?? "";
  const sources = useOccupationSources(parkingdata.ID);

  return (
    <SectionBlock heading="Verwijssysteem en diashow">
      <div className="space-y-4 max-w-2xl">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={verwijssysteem}
            disabled={!canEditFlags}
            onChange={(e) => setNewVerwijssysteem(e.target.checked)}
          />
          <span>Toon in verwijssysteem (publiek bord)</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={!!overzichten}
            disabled={!canEditFlags}
            onChange={(e) => setNewVerwijssysteemOverzichten(e.target.checked)}
          />
          <span>Toon in overzichten (operator)</span>
        </label>
        <div>
          <label className="block text-sm font-medium mb-1">Nota verwijssysteem (max 100 tekens)</label>
          <input
            type="text"
            maxLength={100}
            className="w-full border rounded px-3 py-2"
            value={nota}
            disabled={!canEditFlags}
            onChange={(e) => setNewNotaVerwijssysteem(e.target.value)}
          />
        </div>
        <fieldset>
          <legend className="text-sm font-medium mb-2">Hoofdbron van bezettingsdata</legend>
          {sources === null ? (
            <p className="text-sm text-gray-600">Bronnen laden…</p>
          ) : sources.length === 0 ? (
            <p className="text-sm text-gray-600">
              Nog geen bezettingsdata ontvangen. Ingestelde bron: {bronLabel}.
            </p>
          ) : (
            <>
              {sources.map((opt) => (
                <label key={opt} className="flex items-center gap-2 mr-4 inline-flex">
                  <input
                    type="radio"
                    name="bronBezettingsdata"
                    value={opt}
                    checked={bron.toLowerCase() === opt.toLowerCase()}
                    disabled={!canEditFlags}
                    onChange={() => setNewBronBezettingsdata(opt)}
                  />
                  {opt}
                </label>
              ))}
              {bron === "" ? (
                <p className="text-sm text-gray-600 mt-1">Ingestelde bron: (geen).</p>
              ) : (
                !sources.some((opt) => opt.toLowerCase() === bron.toLowerCase()) && (
                  <p className="text-sm text-gray-600 mt-1">
                    Ingestelde bron {bron} heeft geen bezettingsdata voor deze stalling.
                  </p>
                )
              )}
            </>
          )}
          <p className="text-sm text-gray-600 mt-2">
            Bij FMS volgt de bezetting de in- en uitchecks. Een bezettingsmelding zet het getal altijd; komt die van een andere login dan de gekozen bron, dan staat er een waarschuwing (occupationSourceWarning) in de webservice-log.
          </p>
        </fieldset>
        <div>
          <label className="block text-sm font-medium mb-1">Dia (HTML voor diashow type Bikepark)</label>
          <p className="text-sm text-gray-600 mb-2">
            Wordt getoond op presentatieschermen bij een diashow-dia van type Bikepark (naast de titel in Diashow-beheer).
          </p>
          {canEditDia ? (
            <TipTapEditor value={dia} onChange={setNewDia} />
          ) : (
            <div className="prose max-w-none border rounded p-3" dangerouslySetInnerHTML={{ __html: dia || "<p><em>Geen inhoud</em></p>" }} />
          )}
        </div>
      </div>
    </SectionBlock>
  );
};

export default ParkingEditVerwijssysteem;
