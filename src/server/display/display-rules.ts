export type OccupancyRow = {
  open: boolean;
  capacity: number;
  occupation: number;
  occupied: number;
  bulkbezetting: number;
};

export type DisplayCell =
  | { kind: "x" }
  | { kind: "vol"; full: true }
  | { kind: "number"; value: number; full: false };

/** Public verwijssysteem / presentaties slides — CF uses OCCUPIED and 0.95. */
export function formatPublicFreePlaces(row: OccupancyRow): DisplayCell {
  if (!row.open) return { kind: "x" };
  const cap = row.capacity;
  const occ = row.occupied;
  if (cap !== 0 && occ / cap > 0.95) return { kind: "vol", full: true };
  return { kind: "number", value: cap - occ, full: false };
}

/** Overzichten VrijePlekken — occupation + bulk, VOL at 0.90. */
export function formatOverzichtenFreePlaces(row: OccupancyRow): DisplayCell {
  if (!row.open) return { kind: "x" };
  const cap = row.capacity;
  const occNet = row.occupation;
  if (cap !== 0 && occNet / cap > 0.9) return { kind: "vol", full: true };
  const free = cap - occNet - row.bulkbezetting;
  return { kind: "number", value: free, full: false };
}

export function formatOverzichtenOccupied(row: OccupancyRow): DisplayCell {
  if (!row.open) return { kind: "x" };
  return { kind: "number", value: row.occupation, full: false };
}

export function displayCellHtml(cell: DisplayCell): string {
  if (cell.kind === "x") return '<span class="red">X</span>';
  if (cell.kind === "vol") return '<span class="red">VOL</span>';
  return String(cell.value);
}
