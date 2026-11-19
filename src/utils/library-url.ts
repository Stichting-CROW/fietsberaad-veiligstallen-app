const PRODUCTION_STATIC = "https://static.veiligstallen.nl";
const FMS_CLIENT_LOGO = "https://fms.veiligstallen.nl/resources/client/logo.png";

/** Origin that serves /library. Production keeps the public static host. */
export function staticLibraryOrigin(): string {
  const configured =
    process.env.NEXT_PUBLIC_STATIC_LIBRARY_BASE ||
    process.env.STATIC_LIBRARY_BASE ||
    PRODUCTION_STATIC;
  return configured.replace(/\/$/, "");
}

export function libraryDirectoryUrl(subdir: "logo" | "logo2" | "fietsenstallingen" | "prijzen" | "client"): string {
  return `${staticLibraryOrigin()}/library/${subdir}/`;
}

/** Filename stored in the database, or a URL that is already absolute. */
export function libraryFileUrl(
  subdir: "logo" | "logo2" | "fietsenstallingen" | "prijzen" | "client",
  file: string | null | undefined,
): string {
  const value = file?.trim() ?? "";
  if (!value) return "";
  if (value.startsWith("http://") || value.startsWith("https://") || value.startsWith("/")) return value;
  return `${libraryDirectoryUrl(subdir)}${value.replace(/^\/+/, "")}`;
}

/** Header logo when a gemeente has none. Unchanged on production. */
export function clientLogoFallback(): string {
  if (process.env.NEXT_PUBLIC_STATIC_LIBRARY_BASE || process.env.STATIC_LIBRARY_BASE) {
    return `${libraryDirectoryUrl("client")}logo.png`;
  }
  return FMS_CLIENT_LOGO;
}
