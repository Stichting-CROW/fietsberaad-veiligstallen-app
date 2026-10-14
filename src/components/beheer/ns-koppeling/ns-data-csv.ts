import type { NSFacilityType, NSLocation } from '~/types/ns-connector';

export type NsLocationCsvRow = {
  soort: 'Fietsenstallingen' | 'Fietskluizen';
  faciliteitstype: string;
  location: NSLocation;
};

const CSV_HEADERS = [
  'Soort',
  'Faciliteitstype',
  'Naam',
  'Station Code',
  'Description',
  'Lat',
  'Lng',
  'Open',
  'Street',
  'House Number',
  'Postal Code',
  'City',
  'Regime',
  'Location Code',
] as const;

function csvCell(value: string): string {
  if (value.includes('"') || value.includes(',') || value.includes('\n') || value.includes('\r')) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function locationFields(location: NSLocation): string[] {
  return [
    location.name ?? '',
    location.stationCode ?? '',
    location.description ?? '',
    location.lat !== undefined ? String(location.lat) : '',
    location.lng !== undefined ? String(location.lng) : '',
    location.open ?? '',
    location.street ?? '',
    location.houseNumber ?? '',
    location.postalCode ?? '',
    location.city ?? '',
    location.extra?.regime ?? '',
    location.extra?.locationCode ?? '',
  ];
}

function rowToCsvCells(row: NsLocationCsvRow): string[] {
  return [row.soort, row.faciliteitstype, ...locationFields(row.location)];
}

function facilityTypesToRows(
  soort: NsLocationCsvRow['soort'],
  facilityTypes: NSFacilityType[],
): NsLocationCsvRow[] {
  const out: NsLocationCsvRow[] = [];
  for (const ft of facilityTypes) {
    const faciliteitstype = ft.name ?? ft.type ?? '';
    for (const location of ft.locations ?? []) {
      out.push({ soort, faciliteitstype, location });
    }
  }
  return out;
}

export function flattenNsConnectorData(data: {
  fietsenstallingen?: NSFacilityType[];
  fietskluizen?: NSFacilityType[];
}): NsLocationCsvRow[] {
  return [
    ...facilityTypesToRows('Fietsenstallingen', data.fietsenstallingen ?? []),
    ...facilityTypesToRows('Fietskluizen', data.fietskluizen ?? []),
  ];
}

export function nsLocationRowsToCsv(rows: NsLocationCsvRow[]): string {
  const lines = [CSV_HEADERS.join(',')];
  for (const row of rows) {
    lines.push(rowToCsvCells(row).map(csvCell).join(','));
  }
  return lines.join('\r\n');
}

export function downloadNsLocationsCsv(rows: NsLocationCsvRow[], filename: string): void {
  const csv = nsLocationRowsToCsv(rows);
  const blob = new Blob(['\ufeff', csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}
