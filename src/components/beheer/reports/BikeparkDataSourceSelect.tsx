import React, { useState, useEffect, useRef } from 'react';
import { type ReportBikepark } from './ReportsFilter';

// Define a new type for bikepark with data source selection
export type BikeparkWithDataSource = {
  StallingsID: string;
  Title: string;
  source: 'FMS' | 'Lumiguide';
};

interface BikeparkDataSourceSelectProps {
  bikeparks: ReportBikepark[];
  onSelectionChange: (selectedBikeparks: BikeparkWithDataSource[]) => void;
}

const BikeparkDataSourceSelect: React.FC<BikeparkDataSourceSelectProps> = ({
  bikeparks,
  onSelectionChange
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const divRef = useRef<HTMLDivElement>(null);

  const isScrollable = bikeparks.length > 20;

  // Initialize state with all bikeparks set to FMS by default
  const [selectedBikeparks, setSelectedBikeparks] = useState<BikeparkWithDataSource[]>(
    bikeparks.map(park => ({
      StallingsID: park.StallingsID,
      Title: park.Title,
      source: 'FMS'
    }))
  );

  // Update state when bikeparks prop changes
  useEffect(() => {
    // Keep previous source selections when possible, default to FMS for new parks
    setSelectedBikeparks(bikeparks.map(park => {
      const existing = selectedBikeparks.find(p => p.StallingsID === park.StallingsID);
      return {
        StallingsID: park.StallingsID,
        Title: park.Title,
        source: existing ? existing.source : 'FMS'
      };
    }));
  }, [bikeparks]);

  // Notify parent component when selections change
  useEffect(() => {
    onSelectionChange(selectedBikeparks);
  }, [selectedBikeparks, onSelectionChange]);

  const handleClickOutside = (event: MouseEvent) => {
    if (divRef.current && divRef.current.contains(event.target as Node)) {
      return;
    }
    if (dropdownRef.current && dropdownRef.current.contains(event.target as Node)) {
      return;
    }
    setIsDropdownOpen(false);
  };

  useEffect(() => {
    if (!isDropdownOpen) return;

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isDropdownOpen]);

  const handleSourceChange = (StallingsID: string, source: 'FMS' | 'Lumiguide') => {
    setSelectedBikeparks(prev =>
      prev.map(park =>
        park.StallingsID === StallingsID
          ? { ...park, source }
          : park
      )
    );
  };

  const getButtonText = () => {
    const sources = selectedBikeparks.map(p => p.source);
    const uniqueSources = [...new Set(sources)];
    // console.log('uniqueSources', uniqueSources)
    if (uniqueSources.length === 1) return `Databron: ${uniqueSources[0]}`;

    return `Databronnen: ${uniqueSources.join(', ')}`;
  }

  return (
    <div className="relative inline-block text-left">
      <button
        ref={divRef}
        type="button"
        onClick={() => setIsDropdownOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-56 h-10 w-full"
      >
        <span>{getButtonText()}</span>
        <svg
          className={`h-4 w-4 text-gray-500 transition-transform ${isDropdownOpen ? "rotate-180" : "rotate-0"}`}
          xmlns="http://www.w3.org/2000/svg"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>
      {isDropdownOpen && (
        <div
          ref={dropdownRef}
          className="absolute left-0 z-30 mt-2 min-w-full w-auto origin-top-left rounded-lg border border-gray-200 bg-white shadow-lg"
          style={{
            maxHeight: isScrollable ? '400px' : 'auto',
            overflowY: isScrollable ? 'auto' : 'visible',
            overflowX: 'hidden',
          }}
        >
          <div className="py-1">
            <div className="px-3 py-2 border-b border-gray-200">
              <h3 className="text-sm font-medium text-gray-700">Gegevensbron per stalling</h3>
            </div>
            <div className="max-h-60 overflow-y-auto w-auto">
              {bikeparks.map(park => (
                <div key={park.StallingsID} className="px-3 py-2 border-b border-gray-100 hover:bg-gray-50 whitespace-nowrap">
                  <div className="flex items-center space-x-4">
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name={`source-${park.StallingsID}`}
                        checked={selectedBikeparks.find(p => p.StallingsID === park.StallingsID)?.source === 'FMS'}
                        onChange={() => handleSourceChange(park.StallingsID, 'FMS')}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">FMS</span>
                    </label>
                    <label className="inline-flex items-center cursor-pointer">
                      <input
                        type="radio"
                        name={`source-${park.StallingsID}`}
                        checked={selectedBikeparks.find(p => p.StallingsID === park.StallingsID)?.source === 'Lumiguide'}
                        onChange={() => handleSourceChange(park.StallingsID, 'Lumiguide')}
                        className="h-4 w-4 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="ml-2 text-sm text-gray-700">Lumiguide</span>
                    </label>
                    <div className="text-sm font-medium text-gray-900">{park.Title}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default BikeparkDataSourceSelect;
