import React, { useEffect, useState, useRef } from 'react';

export type SeriesLabel = 'Maandag' | 'Dinsdag' | 'Woensdag' | 'Donderdag' | 'Vrijdag' | 'Zaterdag' | 'Zondag';

const SERIES_ORDER: SeriesLabel[] = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];

interface WeekdaySelectProps {
  availableSeries: SeriesLabel[];
  selectedSeries: SeriesLabel[];
  setSelectedSeries: React.Dispatch<React.SetStateAction<SeriesLabel[]>>;
}

const WeekdaySelect: React.FC<WeekdaySelectProps> = ({
  availableSeries,
  selectedSeries,
  setSelectedSeries,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const toggleSelectAll = () => {
    if (selectedSeries.length > 0 && selectedSeries.length < availableSeries.length) {
      setSelectedSeries([...availableSeries]);
    } else {
      setSelectedSeries([]);
    }
  };

  const getDisplayText = () => {
    if (selectedSeries.length === 0) {
      return "Geen weekdagen";
    } else if (selectedSeries.length === 1) {
      return selectedSeries[0];
    } else if (selectedSeries.length < availableSeries.length) {
      // Sort selectedSeries according to SERIES_ORDER
      const sortedSeries = [...selectedSeries].sort((a, b) => {
        const indexA = SERIES_ORDER.indexOf(a);
        const indexB = SERIES_ORDER.indexOf(b);
        return indexA - indexB;
      });
      return sortedSeries.map(series => series.substring(0, 2)).join(', ');
    } else {
      return `Alle weekdagen`;
    }
  };

  const handleClickOutside = (event: MouseEvent) => {
    if (buttonRef.current && buttonRef.current.contains(event.target as Node)) {
      return;
    }
    if (dropdownRef.current && dropdownRef.current.contains(event.target as Node)) {
      return;
    }
    setIsDropdownOpen(false);
  };

  useEffect(() => {
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="relative inline-block text-left">
      <button
        ref={buttonRef}
        type="button"
        onClick={() => setIsDropdownOpen((prev) => !prev)}
        className="flex items-center gap-2 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500 min-w-56 h-10 w-full"
      >
        <span>{getDisplayText()}</span>
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
          className="absolute left-0 z-30 mt-2 w-full origin-top-left rounded-lg border border-gray-200 bg-white shadow-lg"
        >
          <div className="py-1">
            <button
              type="button"
              onClick={toggleSelectAll}
              className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {selectedSeries.length === availableSeries.length ? 'Deselecteer alles' : 'Selecteer alles'}
            </button>
            {availableSeries.map((series) => (
              <label
                key={series}
                className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={selectedSeries.includes(series)}
                  value={series}
                  onChange={() =>
                    setSelectedSeries((prev) =>
                      prev.includes(series)
                        ? prev.filter((s) => s !== series)
                        : [...prev, series]
                    )
                  }
                  className="mr-2"
                />
                {series}
              </label>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default WeekdaySelect;

