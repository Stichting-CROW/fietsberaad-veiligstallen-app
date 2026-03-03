/**
 * SEO utilities for meta tags, URLs, and descriptions.
 */

const META_DESCRIPTION_MAX_LENGTH = 160;
const DEFAULT_IMAGE_PATH = "/icons/preview-image.png";

/**
 * Get the base URL for the site.
 * Prefers NEXT_PUBLIC_SITE_URL, falls back to NEXTAUTH_URL.
 */
export function getBaseUrl(): string {
  if (typeof window !== "undefined") {
    return (
      process.env.NEXT_PUBLIC_SITE_URL ??
      process.env.NEXTAUTH_URL ??
      ""
    );
  }
  return (
    process.env.NEXT_PUBLIC_SITE_URL ??
    process.env.NEXTAUTH_URL ??
    "https://beta.veiligstallen.nl"
  );
}

/**
 * Get robots meta content based on environment.
 * Production: index, follow. Acceptance: noindex, nofollow.
 */
export function getRobotsContent(): string {
  const env = process.env.NEXT_PUBLIC_APP_ENV;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? "";

  if (env === "acceptance") {
    return "noindex, nofollow";
  }
  if (env === "production") {
    return "index, follow";
  }
  // Derive from URL if APP_ENV not set
  if (siteUrl.includes("vstfb-eu-acc") || siteUrl.includes("acceptance")) {
    return "noindex, nofollow";
  }
  return "index, follow";
}

/**
 * Build full image URL for parking.
 * If image doesn't start with http, prepend static.veiligstallen.nl path.
 */
export function buildParkingImageUrl(image: string | null | undefined): string | null {
  if (!image || typeof image !== "string") {
    return null;
  }
  if (image.includes("http")) {
    return image;
  }
  return `https://static.veiligstallen.nl/library/fietsenstallingen/${image}`;
}

/**
 * Get default preview image URL for pages without a specific image.
 */
export function getDefaultImageUrl(): string {
  const base = getBaseUrl();
  return base ? `${base.replace(/\/$/, "")}${DEFAULT_IMAGE_PATH}` : `https://beta.veiligstallen.nl${DEFAULT_IMAGE_PATH}`;
}

/**
 * Strip HTML tags from a string.
 */
export function stripHtml(html: string | null | undefined): string {
  if (!html || typeof html !== "string") {
    return "";
  }
  return html.replace(/<[^>]*>/g, "").trim();
}

/**
 * Create a meta description from HTML or plain text.
 * Strips HTML and truncates to ~160 chars.
 */
export function toMetaDescription(
  text: string | null | undefined,
  maxLength: number = META_DESCRIPTION_MAX_LENGTH
): string {
  const plain = stripHtml(text);
  if (!plain) return "";
  if (plain.length <= maxLength) return plain;
  return plain.slice(0, maxLength - 3).trim() + "...";
}
