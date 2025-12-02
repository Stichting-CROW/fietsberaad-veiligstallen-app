import React, { useEffect, useState, useRef } from 'react';
import { type VSFietsenstallingLijst } from '~/types/fietsenstallingen';

interface BikeparkSelectProps {
  bikeparks: VSFietsenstallingLijst[];
  selectedBikeparkIDs: string[];
  setSelectedBikeparkIDs: React.Dispatch<React.SetStateAction<string[]>>;
  singleSelection?: boolean; // If true, use radio buttons (single selection). If false, use checkboxes (multiple selection).
}

const BikeparkSelect: React.FC<BikeparkSelectProps> = ({
  bikeparks,
  selectedBikeparkIDs,
  setSelectedBikeparkIDs,
  singleSelection = false,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const divRef = useRef<HTMLButtonElement>(null);

  const isScrollable = bikeparks.length > 20;

  const toggleSelectAll = () => {
    const validBikeparkIDs = bikeparks.filter(bp => bp.StallingsID!==null).map(bp => bp.StallingsID as string);
    if (selectedBikeparkIDs.length > 0 && selectedBikeparkIDs.length < validBikeparkIDs.length) {
      setSelectedBikeparkIDs(validBikeparkIDs);
    } else {
      const newSelection = bikeparks.filter((park => selectedBikeparkIDs.includes(park.StallingsID as string) === false)).map(park => park.StallingsID as string);
      setSelectedBikeparkIDs(newSelection);
    }
  };

  // const handleOk = () => {
  //   setSelectedBikeparkIDs(selectedBikeparkIDs);
  //   setIsDropdownOpen(false);
  // };

  const getDisplayText = () => {
    if (selectedBikeparkIDs.length === 0) {
      return singleSelection ? "Geen stalling" : "Geen stallingen";
    } else if (selectedBikeparkIDs.length === 1) {
      return bikeparks.find(park => park.StallingsID === selectedBikeparkIDs[0])?.Title?.trim() || "";
    } else if (selectedBikeparkIDs.length < bikeparks.length) {
      return `${selectedBikeparkIDs.length} Stallingen`;
    } else {
      return `Alle stallingen`;
    }
  };

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
    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="relative inline-block text-left">
      <button
        ref={divRef}
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
          style={{
            maxHeight: isScrollable ? '200px' : 'auto',
            overflowY: isScrollable ? 'auto' : 'visible',
            overflowX: 'hidden',
          }}
        >
          <div className="py-1">
            {!singleSelection && (
              <button
                type="button"
                onClick={toggleSelectAll}
                className="w-full px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {selectedBikeparkIDs.length === bikeparks.length ? 'Deselecteer alles' : 'Selecteer alles'}
              </button>
            )}
            {[...bikeparks]
              .slice()
              .sort((a, b) => (a.Title || "").localeCompare(b.Title || ""))
              .map((park) => {
              const parkId = park.StallingsID as string;
              const isSelected = selectedBikeparkIDs.includes(parkId);
              
              return (
                <label
                  key={park.StallingsID}
                  className="flex items-center px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type={singleSelection ? "radio" : "checkbox"}
                    name={singleSelection ? "bikepark-select" : undefined}
                    checked={isSelected}
                    value={parkId}
                    onChange={() => {
                      if (singleSelection) {
                        // Radio mode: replace selection with just this one
                        setSelectedBikeparkIDs([parkId]);
                      } else {
                        // Checkbox mode: toggle selection
                        setSelectedBikeparkIDs((prev) =>
                          prev.includes(parkId)
                            ? prev.filter((id) => id !== parkId)
                            : [...prev, parkId]
                        );
                      }
                    }}
                    className="mr-2"
                  />
                  {park.Title}
                </label>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default BikeparkSelect;
