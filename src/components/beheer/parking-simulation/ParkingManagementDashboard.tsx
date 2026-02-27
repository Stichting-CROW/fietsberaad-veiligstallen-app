import React, { useState, useEffect } from "react";
import { Tabs, Tab, Box } from "@mui/material";
import DashboardOverview from "./DashboardOverview";
import FietsenTab from "./FietsenTab";
import StallingPanel from "./StallingPanel";
import SettingsTab from "./SettingsTab";
type Stalling = { id: string; locationid: string; title: string; type: string; berekentStallingskosten?: boolean };

const ParkingManagementDashboard: React.FC = () => {
  const [stallings, setStallings] = useState<Stalling[]>([]);
  const [activeTab, setActiveTab] = useState<string>("settings");
  const [tablesExist, setTablesExist] = useState<boolean | null>(null);
  const [bicycleCount, setBicycleCount] = useState<number>(0);

  const fetchTablesStatus = async () => {
    try {
      const res = await fetch("/api/protected/parking-simulation/tables");
      if (res.ok) {
        const data = await res.json();
        setTablesExist(data.tablesExist ?? false);
      } else {
        setTablesExist(null);
      }
    } catch {
      setTablesExist(null);
    }
  };

  useEffect(() => {
    void fetchTablesStatus();
    const onUpdated = () => void fetchTablesStatus();
    window.addEventListener("tables-updated", onUpdated);
    return () => window.removeEventListener("tables-updated", onUpdated);
  }, []);

  const fetchStallings = () => {
    fetch("/api/protected/parking-simulation/test-gemeente/status")
      .then((r) => (r.ok ? r.json() : { exists: false, id: null }))
      .then(async (status: { exists?: boolean; id?: string | null }) => {
        if (!status.exists || !status.id) {
          setStallings([]);
          return;
        }
        const res = await fetch(`/api/protected/fietsenstallingen?GemeenteID=${status.id}`);
        const json = (await (res.ok ? res.json() : { data: [] })) as { data?: Array<{ ID: string; StallingsID: string; Title: string | null; Type: string | null; BerekentStallingskosten?: boolean }> };
        const list = json.data ?? [];
        setStallings(
          list.map((s) => ({
            id: s.ID,
            locationid: s.StallingsID,
            title: s.Title ?? "",
            type: s.Type ?? "",
            berekentStallingskosten: s.BerekentStallingskosten,
          }))
        );
      })
      .catch(() => setStallings([]));
  };

  useEffect(() => {
    fetchStallings();
    const onUpdated = () => fetchStallings();
    window.addEventListener("stallings-updated", onUpdated);
    return () => window.removeEventListener("stallings-updated", onUpdated);
  }, []);

  const fetchBicycleCount = () => {
    fetch("/api/protected/parking-simulation/state")
      .then((r) => (r.ok ? r.json() : {}))
      .then((data: { bicycles?: unknown[] }) => {
        setBicycleCount((data.bicycles ?? []).length);
      })
      .catch(() => setBicycleCount(0));
  };

  useEffect(() => {
    if (tablesExist === true) {
      fetchBicycleCount();
      window.addEventListener("simulation-clock-updated", fetchBicycleCount);
      return () => window.removeEventListener("simulation-clock-updated", fetchBicycleCount);
    } else {
      setBicycleCount(0);
    }
  }, [tablesExist]);

  const selectedStalling = stallings.find((s) => s.locationid === activeTab);
  const showFullTabs = tablesExist === true;
  const hasBikes = bicycleCount > 0;

  useEffect(() => {
    if (!showFullTabs && activeTab !== "settings") {
      setActiveTab("settings");
    }
  }, [showFullTabs, activeTab]);

  useEffect(() => {
    if (!hasBikes && activeTab === "fietsen") {
      setActiveTab("dashboard");
    }
  }, [hasBikes, activeTab]);

  return (
    <Box>
      <Tabs
        value={activeTab}
        onChange={(_, v) => setActiveTab(v)}
        variant="scrollable"
        scrollButtons="auto"
        className="mb-4"
      >
        {showFullTabs && <Tab label="Dashboard" value="dashboard" />}
        {showFullTabs && hasBikes && <Tab label="Fietsen" value="fietsen" />}
        {showFullTabs && stallings.map((s) => (
          <Tab key={s.id} label={s.title} value={s.locationid} />
        ))}
        <Tab label="Instellingen" value="settings" />
      </Tabs>

      {showFullTabs && activeTab === "dashboard" && <DashboardOverview hasStallings={stallings.length > 0} />}
      {showFullTabs && hasBikes && activeTab === "fietsen" && <FietsenTab stallings={stallings} />}
      {showFullTabs && selectedStalling && <StallingPanel locationid={selectedStalling.locationid} title={selectedStalling.title} berekentStallingskosten={selectedStalling.berekentStallingskosten} />}
      {activeTab === "settings" && <SettingsTab />}
    </Box>
  );
};

export default ParkingManagementDashboard;
