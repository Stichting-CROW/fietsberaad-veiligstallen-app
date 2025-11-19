const PARKING_ID_REGEX = /^[A-Za-z0-9_-]{1,35}$/;

/**
 * Validates and normalizes a fietsenstalling ID coming from user input.
 * Returns the sanitized ID when valid, otherwise null.
 */
export const validateParkingId = (value: unknown): string | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed || trimmed.length > 35) {
    return null;
  }

  if (!PARKING_ID_REGEX.test(trimmed)) {
    return null;
  }

  return trimmed;
};

/**
 * Parses a stringifiable value into a positive integer ID.
 * Returns null when the input is missing, non-numeric or <= 0.
 */
export const parsePositiveIntId = (value: unknown): number | null => {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) {
    return null;
  }

  const parsed = Number(trimmed);
  if (!Number.isSafeInteger(parsed) || parsed <= 0) {
    return null;
  }

  return parsed;
};

