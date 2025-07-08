import React, { useEffect, useState, useRef } from 'react';
import { type VSFietsenstallingLijst } from '~/types/fietsenstallingen';

interface BikeparkSelectProps {
  bikeparks: VSFietsenstallingLijst[];
  selectedBikeparkIDs: string[];
  setSelectedBikeparkIDs: React.Dispatch<React.SetStateAction<string[]>>;
}

const BikeparkSelect: React.FC<BikeparkSelectProps> = ({
  bikeparks,
  selectedBikeparkIDs,
  setSelectedBikeparkIDs,
}) => {
  const [isDropdownOpen, setIsDropdownOpen] = useState<boolean>(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const divRef = useRef<HTMLDivElement>(null);

  const isScrollable = bikeparks.length > 20;

  const selectClasses = "min-w-56 border-2 border-gray-300 rounded-md w-full cursor-pointer relative h-10 leading-10 px-2";
  const buttonClasses = "w-16 h-8 text-sm border-2 border-gray-300 rounded-md";

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
      return "Geen stallingen";
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
    <>
      <div
        ref={divRef}
        className={selectClasses}
        style={{ userSelect: 'none', backgroundColor: 'rgb(239, 239, 239)' }}
        onClick={() => setIsDropdownOpen((prev) => !prev)}
      >
        {getDisplayText()}
        <button
          className={buttonClasses}
          style={{
            width: '100px',
            position: 'absolute',
            right: '10px',
            top: '50%',
            transform: 'translateY(-50%)',
            pointerEvents: 'none',
            backgroundColor: 'white'
          }}
        >
          Selecteer
        </button>
      </div>
      {isDropdownOpen && (
        <div
          ref={dropdownRef}
          className={selectClasses}
          style={{
            width: 'auto',
            height: 'auto',
            maxHeight: isScrollable ? '200px' : 'auto',
            overflowY: isScrollable ? 'auto' : 'visible',
            overflowX: 'hidden',
            border: '1px solid #ccc',
            position: 'absolute',
            backgroundColor: 'white',
            zIndex: 1000,
          }}
        >
          <button
            className={buttonClasses}
            onClick={toggleSelectAll}
          >
            ✔️
          </button>
          {bikeparks.map((park) => (
            <div key={park.StallingsID}>
              <label>
                <input
                  type="checkbox"
                  checked={selectedBikeparkIDs.includes(park.StallingsID as string)}
                  value={park.StallingsID as string}
                  onChange={() =>
                    setSelectedBikeparkIDs((prev) =>
                      prev.includes(park.StallingsID as string)
                        ? prev.filter((id) => id !== park.StallingsID as string)
                        : [...prev, park.StallingsID as string]
                    )
                  }
                />
                {park.Title}
              </label>
            </div>
          ))}
        </div>
      )}
    </>
  );
};

export default BikeparkSelect;
