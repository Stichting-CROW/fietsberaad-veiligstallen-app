/** Safe post-login redirect targets for the citizen portal and buurt/fietstrommel wizard. */
const WIZARD_PATH =
  /^\/[^/]+\/(buurtstallingen|fietstrommels)(\/[^/?#]+)?(\/(rek|gegevens|bevestiging))?\/?(\?[^#]*)?$/;

export function safeCitizenLoginNext(value: unknown): string {
  if (typeof value !== "string" || !value.startsWith("/") || value.startsWith("//")) return "/account";
  const path = value.split("#")[0] ?? value;
  if (path.startsWith("/account/gemeente")) return "/account";
  if (path.startsWith("/account/")) return path;
  if (WIZARD_PATH.test(path)) return path;
  return "/account";
}

export function isBuurtWizardPath(path: string): boolean {
  return WIZARD_PATH.test(path.split("#")[0] ?? path);
}
