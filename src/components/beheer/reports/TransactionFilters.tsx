import React, { useState, useEffect, useMemo } from 'react';
import type { ParkingDetailsType } from '~/types/parking';

interface Contact {
  ID: string;
  CompanyName: string;
}

interface Gemeente {
  ID: string;
  CompanyName?: string;
}

interface Exploitant {
  ID: string;
  CompanyName?: string;
}

interface LocationWithData {
  locationID: string;
  stallingName: string;
  contactID: string;
  contactName: string;
  stallingType: string | null;
}

interface TransactionFiltersProps {
  // Filter values
  selectedYear: number;
  selectedContactID: string | null;
  selectedLocationID: string | null;
  
  // Filter options
  years: number[];
  gemeenten?: Gemeente[];
  exploitanten?: Exploitant[];
  isFietsberaad: boolean; // Whether user is Fietsberaad (determines if contact filter is shown)
  
  // Callbacks
  onYearChange: (year: number) => void;
  onContactChange: (contactID: string | null) => void;
  onLocationChange: (locationID: string | null) => void;
  
  // Display options
  yearFirst?: boolean; // Whether to show year first (default: false)
  
  // Optional callback to get filtered data
  onFilteredDataChange?: (data: {
    contacts: Contact[];
    filteredParkingLocations: ParkingDetailsType[];
  }) => void;
}

const TransactionFilters: React.FC<TransactionFiltersProps> = ({
  selectedYear,
  selectedContactID,
  selectedLocationID,
  years,
  gemeenten,
  exploitanten,
  isFietsberaad,
  onYearChange,
  onContactChange,
  onLocationChange,
  yearFirst = false,
  onFilteredDataChange
}) => {
  const [locationsWithData, setLocationsWithData] = useState<LocationWithData[]>([]);

  // Fetch locations with data for the selected year
  useEffect(() => {
    const fetchLocationsWithData = async () => {
      try {
        console.log('[TransactionFilters] Fetching locations with data for year', selectedYear);
        const response = await fetch('/api/reports/open_transacties_locations', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ year: selectedYear })
        });

        if (!response.ok) {
          throw new Error(`Error: ${response.statusText}`);
        }

        const data = await response.json();
        console.log('[TransactionFilters] Found', data.length, 'locations with data');
        setLocationsWithData(data);
      } catch (err) {
        console.error('[TransactionFilters] Error fetching locations with data:', err);
        setLocationsWithData([]);
      }
    };

    fetchLocationsWithData();
  }, [selectedYear]);

  // Filter contacts to only those that have locations with data
  const contacts = useMemo(() => {
    if (locationsWithData.length === 0) {
      // If no data yet, show all contacts
      return [
        { ID: "1", CompanyName: "Fietsberaad" },
        ...(gemeenten || []).map(gemeente => ({ ID: gemeente.ID, CompanyName: gemeente.CompanyName || "Gemeente " + gemeente.ID })),
        ...(exploitanten || []).map(exploitant => ({ ID: exploitant.ID, CompanyName: exploitant.CompanyName || "Exploitant " + exploitant.ID }))
      ].sort((a, b) => a.CompanyName.localeCompare(b.CompanyName));
    }

    // Get unique contact IDs from locations with data
    const contactIDs = new Set(locationsWithData.map(loc => loc.contactID));
    
    // Filter contacts to only those with data
    const allContacts = [
      { ID: "1", CompanyName: "Fietsberaad" },
      ...(gemeenten || []).map(gemeente => ({ ID: gemeente.ID, CompanyName: gemeente.CompanyName || "Gemeente " + gemeente.ID })),
      ...(exploitanten || []).map(exploitant => ({ ID: exploitant.ID, CompanyName: exploitant.CompanyName || "Exploitant " + exploitant.ID }))
    ];

    return allContacts
      .filter(contact => contactIDs.has(contact.ID))
      .sort((a, b) => a.CompanyName.localeCompare(b.CompanyName));
  }, [locationsWithData, gemeenten, exploitanten]);

  // Filter parking locations based on selected contact and locations with data
  const filteredParkingLocations = useMemo(() => {
    if (!selectedContactID || locationsWithData.length === 0) {
      return [];
    }

    // Filter locations by selected contact and convert to ParkingDetailsType
    return locationsWithData
      .filter(loc => loc.contactID === selectedContactID)
      .map(loc => ({
        StallingsID: loc.locationID,
        Title: loc.stallingName,
        SiteID: loc.contactID === "1" ? null : loc.contactID,
        ExploitantID: loc.contactID === "1" ? null : loc.contactID,
        Type: loc.stallingType
      } as ParkingDetailsType))
      .sort((a, b) => (a.Title || '').localeCompare(b.Title || ''));
  }, [selectedContactID, locationsWithData]);

  // Notify parent component of filtered data changes
  useEffect(() => {
    if (onFilteredDataChange) {
      onFilteredDataChange({
        contacts,
        filteredParkingLocations
      });
    }
  }, [contacts, filteredParkingLocations, onFilteredDataChange]);
  const filters = [];

  // Year filter
  const yearFilter = (
    <div key="year" className="flex flex-col">
      <label htmlFor="year" className="text-sm font-medium text-gray-700 mb-1">
        Jaar
      </label>
      <select
        id="year"
        className="min-w-56 h-10 p-2 border-2 border-gray-300 rounded-md"
        value={selectedYear}
        onChange={(e) => {
          const newYear = parseInt(e.target.value);
          onYearChange(newYear);
        }}
      >
        {years.map(year => (
          <option key={year} value={year}>
            {year}
          </option>
        ))}
      </select>
    </div>
  );

  // Contact filter
  const contactFilter = isFietsberaad ? (
    <div key="contact" className="flex flex-col">
      <label htmlFor="contact" className="text-sm font-medium text-gray-700 mb-1">
        Contact
      </label>
      <select
        id="contact"
        className="min-w-56 h-10 p-2 border-2 border-gray-300 rounded-md"
        value={selectedContactID || ''}
        onChange={(e) => {
          onContactChange(e.target.value || null);
          onLocationChange(null);
        }}
      >
        <option value="">Geen</option>
        {contacts.map(contact => (
          <option key={contact.ID} value={contact.ID}>
            {contact.CompanyName}
          </option>
        ))}
      </select>
    </div>
  ) : null;

  // Location filter
  const locationFilter = (
    <div key="location" className="flex flex-col">
      <label htmlFor="location" className="text-sm font-medium text-gray-700 mb-1">
        Stalling
      </label>
      <select
        id="location"
        className="min-w-56 h-10 p-2 border-2 border-gray-300 rounded-md"
        value={selectedLocationID || ''}
        onChange={(e) => onLocationChange(e.target.value || null)}
        disabled={filteredParkingLocations.length === 0}
      >
        <option value="">Selecteer een stalling</option>
        {filteredParkingLocations.map(location => (
          <option key={location.StallingsID} value={location.StallingsID || ''}>
            {location.Title}
          </option>
        ))}
      </select>
    </div>
  );

  // Build filter order based on yearFirst prop
  if (yearFirst) {
    filters.push(yearFilter);
    if (contactFilter) filters.push(contactFilter);
    filters.push(locationFilter);
  } else {
    if (contactFilter) filters.push(contactFilter);
    filters.push(locationFilter);
    filters.push(yearFilter);
  }

  return (
    <div className="mb-6 space-y-4">
      {filters}
    </div>
  );
};

export default TransactionFilters;

