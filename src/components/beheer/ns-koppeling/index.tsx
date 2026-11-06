import React, { useCallback, useEffect, useState } from 'react';
import { useSession } from 'next-auth/react';
import { Button } from '~/components/Button';
import type { NSFacilityType, NSLocation } from '~/types/ns-connector';
import { userHasRight } from '~/types/utils';
import { VSSecurityTopic } from '~/types/securityprofile';
import type { NsSyncSummary } from '~/server/services/ns-connector/sync';
import { NsImportResultsPanel } from '~/components/beheer/ns-koppeling/NsImportResultsPanel';
import {
  downloadNsLocationsCsv,
  flattenNsConnectorData,
} from '~/components/beheer/ns-koppeling/ns-data-csv';

type NSConnectorData = {
  fietsenstallingen?: NSFacilityType[];
  fietskluizen?: NSFacilityType[];
};

type MainTab = 'koppeling' | 'data';

const NsKoppelingComponent: React.FC = () => {
  const { data: session } = useSession();
  const [mainTab, setMainTab] = useState<MainTab>('koppeling');
  const [connectorAvailable, setConnectorAvailable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<NSConnectorData | null>(null);
  const [importSummary, setImportSummary] = useState<NsSyncSummary | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<NSLocation | null>(null);
  const hasSuperadmin = userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin);

  useEffect(() => {
    if (!session) return;
    void fetch('/api/protected/ns-connector/check-available')
      .then((r) => (r.ok ? r.json() : { available: false }))
      .then((body) => setConnectorAvailable(Boolean(body.available)))
      .catch(() => setConnectorAvailable(false));
  }, [session]);

  const fetchNsData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/protected/ns-connector/fetch-data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      setData(await response.json());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mainTab === 'data' && connectorAvailable === true) {
      void fetchNsData();
    }
  }, [mainTab, connectorAvailable, fetchNsData]);

  const handleImport = async (dryRun: boolean) => {
    if (!dryRun) {
      const confirmed = window.confirm(
        'Weet je zeker dat je NS-locaties naar de database wilt importeren? Dit overschrijft bestaande NS-stallingen met API-data.',
      );
      if (!confirmed) return;
    }
    setImportLoading(true);
    setError(null);
    setImportSummary(null);
    try {
      const response = await fetch('/api/protected/ns-connector/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dryRun }),
      });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(result.error || `HTTP ${response.status}: ${response.statusText}`);
      }
      setImportSummary(result.summary ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Onbekende fout');
    } finally {
      setImportLoading(false);
    }
  };

  const renderLocationTable = (locations: NSLocation[]) => {
    if (!locations.length) {
      return <div className="text-sm text-gray-500 py-4">Geen locaties gevonden.</div>;
    }
    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {['Naam', 'Station Code', 'Description', 'Lat', 'Lng', 'Open', 'Street', 'House Number', 'Postal Code', 'City', 'Regime', 'Location Code'].map(
                (h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {locations.map((location, index) => (
              <tr key={index} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedLocation(location)}>
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">{location.name || '-'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{location.stationCode || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{location.description || '-'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{location.lat ?? '-'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{location.lng ?? '-'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{location.open || '-'}</td>
                <td className="px-4 py-3 text-sm text-gray-500">{location.street || '-'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{location.houseNumber || '-'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{location.postalCode || '-'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{location.city || '-'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{location.extra?.regime || '-'}</td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">{location.extra?.locationCode || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderFacilityTypeTable = (facilityTypes: NSFacilityType[]) => {
    if (!facilityTypes.length) {
      return <div className="text-sm text-gray-500 py-4">Geen gegevens gevonden.</div>;
    }
    return (
      <div className="space-y-6">
        {facilityTypes.map((facilityType, typeIndex) => (
          <div key={typeIndex} className="border border-gray-200 rounded-lg overflow-hidden">
            <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">{facilityType.name}</h3>
              <div className="text-sm text-gray-600 mt-1">
                {facilityType.locations?.length ?? 0} locaties
                {facilityType.categories?.length ? (
                  <span className="ml-2 text-gray-500">• {facilityType.categories.join(', ')}</span>
                ) : null}
              </div>
            </div>
            <div className="p-4">{renderLocationTable(facilityType.locations ?? [])}</div>
          </div>
        ))}
      </div>
    );
  };

  const renderDataSection = (title: string, facilityTypes: NSFacilityType[] | undefined) => {
    if (!facilityTypes?.length) return null;
    return (
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-4">{title}</h2>
        {renderFacilityTypeTable(facilityTypes)}
      </div>
    );
  };

  const totalStallingenLocations =
    data?.fietsenstallingen?.reduce((sum, ft) => sum + (ft.locations?.length || 0), 0) || 0;
  const totalFietskluizenLocations =
    data?.fietskluizen?.reduce((sum, ft) => sum + (ft.locations?.length || 0), 0) || 0;
  const totalNsLocations = totalStallingenLocations + totalFietskluizenLocations;

  const tabClass = (active: boolean) =>
    `py-2 px-1 border-b-2 font-medium text-sm whitespace-nowrap ${
      active
        ? 'border-blue-500 text-blue-600'
        : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
    }`;

  if (connectorAvailable === false) {
    return (
      <div className="max-w-3xl">
        <h1 className="text-2xl font-semibold text-gray-900 mb-4">NS Koppeling</h1>
        <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg p-4">
          NS Connector is niet geconfigureerd. Stel <code className="text-xs">NSCONNECTOR_SUBSCRIPTION_KEY</code> in op
          de server.
        </p>
      </div>
    );
  }

  return (
    <div className="max-w-7xl">
      <h1 className="text-2xl font-semibold text-gray-900 mb-2">NS Koppeling</h1>
      <p className="text-sm text-gray-600 mb-4">
        NS Places API: synchroniseren naar fietsenstallingen (NS / ns-stations) of live API-data bekijken.
      </p>

      <div className="mb-6 border-b border-gray-200">
        <nav className="-mb-px flex space-x-8" aria-label="NS koppeling tabs">
          <button type="button" className={tabClass(mainTab === 'koppeling')} onClick={() => setMainTab('koppeling')}>
            NS Koppeling
          </button>
          <button type="button" className={tabClass(mainTab === 'data')} onClick={() => setMainTab('data')}>
            NS Data inzien
          </button>
        </nav>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-300 rounded-lg p-4 mb-6 text-sm text-red-700">{error}</div>
      )}

      {mainTab === 'koppeling' && (
        <div className="space-y-6">
          <p className="text-sm text-gray-600">
            Voer een voorbeeld-import uit of schrijf NS-locaties naar de database. Na afloop zie je de LOG-mail (en
            eventuele ERROR-mail) zoals na de nachtelijke job.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 max-w-xl">
            <Button
              onClick={() => handleImport(true)}
              disabled={loading || importLoading || connectorAvailable !== true}
              className="flex-1"
              style={{ backgroundColor: '#059669' }}
            >
              {importLoading ? 'Bezig...' : 'Voorbeeld import (dry run)'}
            </Button>
            {hasSuperadmin && (
              <Button
                onClick={() => handleImport(false)}
                disabled={loading || importLoading || connectorAvailable !== true}
                className="flex-1"
                style={{ backgroundColor: '#DC2626' }}
              >
                {importLoading ? 'Bezig...' : 'Importeer naar database'}
              </Button>
            )}
          </div>

          {importSummary && <NsImportResultsPanel summary={importSummary} />}

          {importSummary && importSummary.completionMails.length > 0 && (
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-2">E-mail na afloop</h2>
              <p className="text-sm text-gray-600 mb-4">
                {importSummary.dryRun
                  ? 'Voorbeeld: deze berichten worden verstuurd na een echte import als BUURTSTALLINGEN_OPS_EMAIL is ingesteld.'
                  : importSummary.completionMails.every((m) => !m.sent)
                    ? 'Geen e-mail verstuurd (BUURTSTALLINGEN_OPS_EMAIL niet ingesteld).'
                    : 'Verstuurd waar een ontvanger was geconfigureerd.'}
              </p>
              <div className="space-y-4">
                {importSummary.completionMails.map((mail, i) => (
                  <div key={i} className="border border-gray-200 rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-2 border-b border-gray-200 flex flex-wrap gap-2 items-center justify-between">
                      <span className="text-sm font-medium text-gray-900">{mail.subject}</span>
                      <span className="text-xs text-gray-500">
                        {importSummary.dryRun ? 'niet verzonden (dry run)' : mail.sent ? 'verzonden' : 'niet verzonden'}
                      </span>
                    </div>
                    <div
                      className="p-4 text-sm text-gray-800 prose prose-sm max-w-none"
                      dangerouslySetInnerHTML={{ __html: mail.html }}
                    />
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {mainTab === 'data' && (
        <div className="space-y-6">
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => void fetchNsData()}
              disabled={loading || importLoading || connectorAvailable !== true}
              style={{ backgroundColor: '#3B82F6' }}
            >
              {loading ? 'Bezig...' : 'Verversen'}
            </Button>
            {loading && !data && <span className="text-sm text-gray-500">NS-data ophalen…</span>}
          </div>

          {data && (
            <>
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <div className="flex flex-wrap gap-3 items-center justify-between mb-4">
                  <h2 className="text-xl font-bold text-gray-900">Overzicht</h2>
                  <button
                    type="button"
                    className="text-sm font-medium text-blue-600 hover:text-blue-800 border border-blue-200 rounded-md px-3 py-1.5 bg-white hover:bg-blue-50"
                    onClick={() => downloadNsLocationsCsv(flattenNsConnectorData(data), 'ns-locaties.csv')}
                    disabled={totalNsLocations === 0}
                  >
                    Export CSV ({totalNsLocations} locaties)
                  </button>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="bg-blue-50 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-blue-800 mb-1">Fietsenstallingen</h3>
                    <p className="text-2xl font-bold text-blue-900">{data.fietsenstallingen?.length || 0} types</p>
                    <p className="text-sm text-blue-600 mt-1">{totalStallingenLocations} locaties totaal</p>
                  </div>
                  <div className="bg-green-50 rounded-lg p-4">
                    <h3 className="text-sm font-medium text-green-800 mb-1">Fietskluizen</h3>
                    <p className="text-2xl font-bold text-green-900">{data.fietskluizen?.length || 0} types</p>
                    <p className="text-sm text-green-600 mt-1">{totalFietskluizenLocations} locaties totaal</p>
                  </div>
                </div>
              </div>
              {renderDataSection('Fietsenstallingen', data.fietsenstallingen)}
              {renderDataSection('Fietskluizen', data.fietskluizen)}
            </>
          )}
        </div>
      )}

      {selectedLocation && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedLocation(null);
          }}
        >
          <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
            <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
              <h2 className="text-xl font-bold text-gray-900">Locatie Details: {selectedLocation.name}</h2>
              <button
                type="button"
                onClick={() => setSelectedLocation(null)}
                className="text-gray-400 hover:text-gray-600"
                aria-label="Sluiten"
              >
                ×
              </button>
            </div>
            <div className="px-6 py-4 overflow-auto flex-1">
              <textarea
                readOnly
                value={JSON.stringify(selectedLocation, null, 2)}
                className="w-full min-h-[400px] p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm font-mono resize-none"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default NsKoppelingComponent;
