import type { ShutdownSettings } from "./scenario";

const KEY = "azure-kosten-instellingen";

function names(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function emptyShutdownSettings(): ShutdownSettings {
  return { ratio: null, excluded: [], stoppedUnclassified: [] };
}

export function loadShutdownSettings(): ShutdownSettings {
  if (typeof localStorage === "undefined") return emptyShutdownSettings();
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyShutdownSettings();
    const parsed = JSON.parse(raw) as { ratio?: unknown; excluded?: unknown; stoppedUnclassified?: unknown };
    const ratio = typeof parsed.ratio === "number" && Number.isFinite(parsed.ratio) ? parsed.ratio : null;
    return { ratio, excluded: names(parsed.excluded), stoppedUnclassified: names(parsed.stoppedUnclassified) };
  } catch {
    return emptyShutdownSettings();
  }
}

export function saveShutdownSettings(settings: ShutdownSettings): void {
  localStorage.setItem(KEY, JSON.stringify(settings));
}
