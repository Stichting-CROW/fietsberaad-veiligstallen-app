import { useState, useEffect } from "react";
import { type VSTariefcode } from "~/types/tariefcodes";

// Module-level singleton cache to share data across all hook instances
let cachedTariefcodes: VSTariefcode[] | null = null;
let fetchPromise: Promise<VSTariefcode[]> | null = null;
let isLoadingCache = false;

const fetchTariefcodesOnce = async (): Promise<VSTariefcode[]> => {
  // If already cached, return immediately
  if (cachedTariefcodes !== null) {
    return cachedTariefcodes;
  }

  // If fetch is already in progress, return the existing promise
  if (fetchPromise !== null) {
    return fetchPromise;
  }

  // Start new fetch
  isLoadingCache = true;
  fetchPromise = (async () => {
    try {
      const response = await fetch("/api/tariefcodes");
      const result = await response.json();
      
      if (result.data) {
        cachedTariefcodes = result.data;
        return result.data;
      } else {
        throw new Error(result.error || "Failed to fetch tariefcodes");
      }
    } catch (err) {
      // Clear promise on error so we can retry
      fetchPromise = null;
      isLoadingCache = false;
      throw err;
    } finally {
      isLoadingCache = false;
    }
  })();

  return fetchPromise;
};

export const useTariefcodes = () => {
  const [tariefcodes, setTariefcodes] = useState<VSTariefcode[]>(cachedTariefcodes || []);
  const [isLoading, setIsLoading] = useState(isLoadingCache || cachedTariefcodes === null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // If already cached, use cached data
    if (cachedTariefcodes !== null) {
      setTariefcodes(cachedTariefcodes);
      setIsLoading(false);
      return;
    }

    // Fetch tariefcodes (will use singleton promise if already fetching)
    const loadTariefcodes = async () => {
      try {
        setIsLoading(true);
        setError(null);
        const data = await fetchTariefcodesOnce();
        setTariefcodes(data);
        setError(null);
      } catch (err) {
        console.error("Error fetching tariefcodes:", err);
        setError(err instanceof Error ? err.message : "Fout bij het laden van tariefcodes");
      } finally {
        setIsLoading(false);
      }
    };

    loadTariefcodes();
  }, []);

  const getTariefcodeText = (tariefcodeId: number | null | undefined): string => {
    // null value is not in the tariefcode table, for 0 also use a blank string
    if (tariefcodeId === null || tariefcodeId === undefined || tariefcodeId === 0) {
      return "";
    }

    // Use cached data if available, otherwise fallback to component state
    const data = cachedTariefcodes || tariefcodes;
    const tariefcode = data.find((t) => t.ID === tariefcodeId);
    return tariefcode?.Omschrijving || "";
  };

  return { tariefcodes, isLoading, error, getTariefcodeText };
};

// Optional: Export function to clear cache if needed (e.g., after admin updates)
export const clearTariefcodesCache = () => {
  cachedTariefcodes = null;
  fetchPromise = null;
  isLoadingCache = false;
};

