import React, { useState } from 'react';
import { useSession } from 'next-auth/react';
import { useRouter } from 'next/router';
import { Button } from '~/components/Button';
import type { NSFacilityType, NSLocation } from '~/types/ns-connector';

type NSConnectorData = {
  fietsenstallingen?: NSFacilityType[];
  fietskluizen?: NSFacilityType[];
};

const NSKoppelingPage: React.FC = () => {
  const { data: session } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<NSConnectorData | null>(null);
  const [selectedLocation, setSelectedLocation] = useState<NSLocation | null>(null);

  const handleFetchNSData = async () => {
    if (!session) {
      setError('Je moet ingelogd zijn om deze functie te gebruiken.');
      return;
    }

    setLoading(true);
    setError(null);
    setData(null);

    try {
      const response = await fetch('/api/protected/ns-connector/fetch-data', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      setData(result);
    } catch (err) {
      console.error('Error fetching NS data:', err);
      setError(err instanceof Error ? err.message : 'Onbekende fout');
    } finally {
      setLoading(false);
    }
  };

  const renderLocationTable = (locations: NSLocation[], title: string) => {
    if (!locations || locations.length === 0) {
      return (
        <div className="text-sm text-gray-500 py-4">
          Geen {title.toLowerCase()} gevonden.
        </div>
      );
    }

    return (
      <div className="overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Naam
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Station Code
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Description
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Lat
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Lng
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Open
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Street
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                House Number
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Postal Code
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                City
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Regime
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Location Code
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {locations.map((location, index) => (
              <tr 
                key={index} 
                className="hover:bg-gray-50 cursor-pointer"
                onClick={() => setSelectedLocation(location)}
              >
                <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900">
                  {location.name || '-'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {location.stationCode || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {location.description || '-'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {location.lat ?? '-'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {location.lng ?? '-'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {location.open || '-'}
                </td>
                <td className="px-4 py-3 text-sm text-gray-500">
                  {location.street || '-'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {location.houseNumber || '-'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {location.postalCode || '-'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {location.city || '-'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {location.extra?.regime || '-'}
                </td>
                <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                  {location.extra?.locationCode || '-'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  const renderFacilityTypeTable = (facilityTypes: NSFacilityType[], title: string) => {
    if (!facilityTypes || facilityTypes.length === 0) {
      return (
        <div className="text-sm text-gray-500 py-4">
          Geen {title.toLowerCase()} gevonden.
        </div>
      );
    }

    return (
      <div className="space-y-6">
        {facilityTypes.map((facilityType, typeIndex) => {
          const totalLocations = facilityType.locations?.length || 0;
          return (
            <div key={typeIndex} className="border border-gray-200 rounded-lg overflow-hidden">
              <div className="bg-gray-50 px-4 py-3 border-b border-gray-200">
                <h3 className="text-lg font-semibold text-gray-900">
                  {facilityType.name}
                </h3>
                <div className="text-sm text-gray-600 mt-1">
                  {totalLocations} {totalLocations === 1 ? 'locatie' : 'locaties'}
                  {facilityType.categories && facilityType.categories.length > 0 && (
                    <span className="ml-2 text-gray-500">
                      • {facilityType.categories.join(', ')}
                    </span>
                  )}
                </div>
              </div>
              <div className="p-4">
                {renderLocationTable(facilityType.locations || [], facilityType.name)}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg shadow-sm p-6 max-w-2xl mx-auto">
          <div className="flex">
            <div className="flex-shrink-0">
              <svg className="h-6 w-6 text-yellow-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="ml-3 flex-1">
              <h3 className="text-lg font-medium text-yellow-800 mb-2">
                Inloggen vereist
              </h3>
              <p className="text-sm text-yellow-700 mb-4">
                U moet ingelogd zijn om deze pagina te bekijken.
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  const totalStallingenLocations = data?.fietsenstallingen?.reduce((sum, ft) => sum + (ft.locations?.length || 0), 0) || 0;
  const totalFietskluizenLocations = data?.fietskluizen?.reduce((sum, ft) => sum + (ft.locations?.length || 0), 0) || 0;

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="max-w-7xl mx-auto">
        <div className="mb-6">
          <Button
            onClick={() => router.push('/test')}
            className="mb-4"
            style={{ backgroundColor: '#6B7280' }}
          >
            ← Terug naar Test Pagina's
          </Button>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            NS-Koppeling
          </h1>
          <p className="text-gray-600">
            Haal data op van de NS API gateway voor fietsenstallingen en fietskluizen.
          </p>
        </div>

        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6 mb-6">
          <Button
            onClick={handleFetchNSData}
            disabled={loading}
            className="w-full"
            style={{ backgroundColor: '#3B82F6' }}
          >
            {loading ? 'Ophalen...' : 'Haal NS Data Op'}
          </Button>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-300 rounded-lg shadow-sm p-4 mb-6">
            <div className="flex">
              <div className="flex-shrink-0">
                <svg className="h-5 w-5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </div>
              <div className="ml-3">
                <h3 className="text-sm font-medium text-red-800">Fout</h3>
                <p className="text-sm text-red-700 mt-1">{error}</p>
              </div>
            </div>
          </div>
        )}

        {data && (
          <div className="space-y-6">
            {/* Summary */}
            <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Overzicht</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="bg-blue-50 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-blue-800 mb-1">Fietsenstallingen</h3>
                  <p className="text-2xl font-bold text-blue-900">
                    {data.fietsenstallingen?.length || 0} types
                  </p>
                  <p className="text-sm text-blue-600 mt-1">
                    {totalStallingenLocations} locaties totaal
                  </p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <h3 className="text-sm font-medium text-green-800 mb-1">Fietskluizen</h3>
                  <p className="text-2xl font-bold text-green-900">
                    {data.fietskluizen?.length || 0} types
                  </p>
                  <p className="text-sm text-green-600 mt-1">
                    {totalFietskluizenLocations} locaties totaal
                  </p>
                </div>
              </div>
            </div>

            {/* Fietsenstallingen */}
            {data.fietsenstallingen && data.fietsenstallingen.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Fietsenstallingen</h2>
                {renderFacilityTypeTable(data.fietsenstallingen, 'Fietsenstallingen')}
              </div>
            )}

            {/* Fietskluizen */}
            {data.fietskluizen && data.fietskluizen.length > 0 && (
              <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Fietskluizen</h2>
                {renderFacilityTypeTable(data.fietskluizen, 'Fietskluizen')}
              </div>
            )}
          </div>
        )}

        {/* Location Detail Modal */}
        {selectedLocation && (
          <div 
            className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                setSelectedLocation(null);
              }
            }}
          >
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col">
              <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
                <h2 className="text-xl font-bold text-gray-900">
                  Locatie Details: {selectedLocation.name}
                </h2>
                <button
                  onClick={() => setSelectedLocation(null)}
                  className="text-gray-400 hover:text-gray-600 transition-colors"
                  aria-label="Sluiten"
                >
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
              <div className="px-6 py-4 overflow-auto flex-1">
                <textarea
                  readOnly
                  value={JSON.stringify(selectedLocation, null, 2)}
                  className="w-full h-full min-h-[400px] p-4 bg-gray-50 border border-gray-200 rounded-lg text-sm text-gray-800 font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  style={{ fontFamily: 'monospace' }}
                />
              </div>
              <div className="px-6 py-4 border-t border-gray-200 flex justify-end">
                <Button
                  onClick={() => setSelectedLocation(null)}
                  style={{ backgroundColor: '#6B7280' }}
                >
                  Sluiten
                </Button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default NSKoppelingPage;
