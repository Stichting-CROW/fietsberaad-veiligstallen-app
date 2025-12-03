export interface ControleSummary {
  aggregationLevel: 'fietsenstalling' | 'data-owner' | 'fietsberaad';
  aggregationId: string;
  aggregationName: string;
  stallingId?: string;
  // Fields for table display
  dataOwnerName: string | null;
  fietsenstallingName: string;
  plaats: string | null;
  // Fields for sync summary table
  laatsteSync: Date | null;
  ageInDays: number | null;
  // Fields for controle overview table
  laatsteControle: Date | null;
  controleAgeInDays: number | null;
  syncAgeInDays: number | null;
}

export interface ControleSummaryResponse {
  data: ControleSummary[];
}

