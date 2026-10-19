export function accountKindLabel(accountType: string | null | undefined): string {
  if (accountType === "SYSTEM") return "Anoniem";
  if (accountType === "USER") return "Gebruiker";
  if (accountType === "DELETED") return "Verwijderd";
  return accountType ?? "—";
}
