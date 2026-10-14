export type AdminBulkReservationRow = {
  id: number;
  aantal: number | null;
  startdatumtijd: string;
  einddatumtijd: string;
  terugkerend: boolean;
  sectieId: number | null;
  sectieTitel: string | null;
  stallingId: string | null;
  stallingTitle: string | null;
  stallingsId: string | null;
  siteId: string | null;
  dataOwnerName: string | null;
  uitzonderingenCount: number;
  actief: boolean;
};
