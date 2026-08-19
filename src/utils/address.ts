export const parseStreetParts = (
  location: string | null,
): { streetName: string; streetNumber: string } => {
  if (!location) return { streetName: "", streetNumber: "" };
  const trimmed = location.trim();
  if (!trimmed) return { streetName: "", streetNumber: "" };

  const match = trimmed.match(/^(.*?)[\s,]+(\d+[a-zA-Z0-9\-\/]*)$/);
  if (!match) {
    return { streetName: trimmed, streetNumber: "" };
  }

  return {
    streetName: match[1]?.trim() ?? trimmed,
    streetNumber: match[2]?.trim() ?? "",
  };
};
