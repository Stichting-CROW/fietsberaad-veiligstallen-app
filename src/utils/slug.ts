/**
 * Convert a parking title to a URL-friendly slug.
 * Example: "Utrecht Stadhuis" → "utrecht-stadhuis"
 */
export function titleToSlug(title: string | null | undefined): string {
  if (!title || typeof title !== "string") return "";
  return title
    .toLowerCase()
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "") // Remove diacritics (accents)
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "") // Keep only alphanumeric and hyphens
    .replace(/-+/g, "-") // Collapse multiple hyphens
    .replace(/^-|-$/g, ""); // Trim leading/trailing hyphens
}
