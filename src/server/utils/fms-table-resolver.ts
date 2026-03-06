/**
 * Resolves table names for the queue processor (production vs test phase).
 * When processing new_wachtrij_* tables, the processor writes to new_* destination tables.
 */

export type FmsTableSet = "production" | "test";

const PRODUCTION_TABLES = {
  transacties: "transacties",
  accounts: "accounts",
  accounts_pasids: "accounts_pasids",
  financialtransactions: "financialtransactions",
  wachtrij_transacties: "wachtrij_transacties",
  wachtrij_pasids: "wachtrij_pasids",
  wachtrij_betalingen: "wachtrij_betalingen",
  wachtrij_sync: "wachtrij_sync",
} as const;

const TEST_TABLES = {
  transacties: "new_transacties",
  accounts: "new_accounts",
  accounts_pasids: "new_accounts_pasids",
  financialtransactions: "new_financialtransactions",
  wachtrij_transacties: "new_wachtrij_transacties",
  wachtrij_pasids: "new_wachtrij_pasids",
  wachtrij_betalingen: "new_wachtrij_betalingen",
  wachtrij_sync: "new_wachtrij_sync",
} as const;

export type TableKey = keyof typeof PRODUCTION_TABLES;

/**
 * Returns the table name for the given key in the specified table set.
 * Use "test" when processing new_wachtrij_* (writes to new_*).
 */
export function resolveTable(key: TableKey, set: FmsTableSet): string {
  return set === "test" ? TEST_TABLES[key] : PRODUCTION_TABLES[key];
}

/**
 * Resolve all destination tables for a table set.
 */
export function resolveDestinationTables(set: FmsTableSet) {
  return {
    transacties: resolveTable("transacties", set),
    accounts: resolveTable("accounts", set),
    accounts_pasids: resolveTable("accounts_pasids", set),
    financialtransactions: resolveTable("financialtransactions", set),
  };
}
