import React, { useState, useEffect, useCallback } from "react";
import { Button } from "~/components/Button";

const SimulationClockOverlay: React.FC = () => {
  const [simTime, setSimTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const fetchSimulationTime = useCallback(async () => {
    try {
      const res = await fetch("/api/protected/parking-simulation/time");
      const data = await res.json();
      setSimTime(data.simulationTime ?? new Date().toISOString());
    } catch {
      setSimTime(new Date().toISOString());
    }
  }, []);

  useEffect(() => {
    fetchSimulationTime();
  }, [fetchSimulationTime]);

  useEffect(() => {
    const t = setInterval(fetchSimulationTime, 15000);
    return () => clearInterval(t);
  }, [fetchSimulationTime]);

  useEffect(() => {
    const handler = () => fetchSimulationTime();
    window.addEventListener("simulation-clock-updated", handler);
    return () => window.removeEventListener("simulation-clock-updated", handler);
  }, [fetchSimulationTime]);

  const advance = async (seconds: number) => {
    setLoading(true);
    try {
      const res = await fetch("/api/protected/parking-simulation/state");
      const data = await res.json();
      const offsetSeconds = data.session?.simulationTimeOffsetSeconds ?? 0;
      const newOffset = Math.max(0, offsetSeconds - seconds);
      if (newOffset === offsetSeconds) return;
      await fetch("/api/protected/parking-simulation/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulationTimeOffsetSeconds: newOffset }),
      });
      window.dispatchEvent(new CustomEvent("simulation-clock-updated"));
      await fetchSimulationTime();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg px-4 py-2">
      <div className="flex items-center gap-3">
        <span className="text-lg font-medium text-gray-700 whitespace-nowrap">Simulatietijd</span>
        <span className="text-xl font-mono font-semibold text-gray-900 min-w-[140px]">
          {simTime
            ? new Date(simTime).toLocaleString("nl-NL", { dateStyle: "short", timeStyle: "medium" })
            : "—"}
        </span>
        <div className="flex gap-1">
          <Button onClick={() => advance(60)} disabled={loading} className="text-lg px-3 py-1.5 mb-0">
            +1 M
          </Button>
          <Button onClick={() => advance(3600)} disabled={loading} className="text-lg px-3 py-1.5 mb-0">
            +1 U
          </Button>
          <Button onClick={() => advance(86400)} disabled={loading} className="text-lg px-3 py-1.5 mb-0">
            +1 D
          </Button>
          <Button onClick={() => advance(604800)} disabled={loading} className="text-lg px-3 py-1.5 mb-0">
            +7 D
          </Button>
        </div>
      </div>
    </div>
  );
};

export default SimulationClockOverlay;
