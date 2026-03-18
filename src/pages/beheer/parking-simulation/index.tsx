import React from "react";
import { useSession } from "next-auth/react";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import ParkingManagementDashboard from "~/components/beheer/parking-simulation/ParkingManagementDashboard";
import SimulationClockOverlay from "~/components/beheer/parking-simulation/SimulationClockOverlay";

const ParkingSimulationPage: React.FC = () => {
  const { data: session, status } = useSession();
  const hasAccess = userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin);

  if (status === "loading") {
    return (
      <div className="container mx-auto px-4 py-8 max-w-[87.5%]">
        <p>Laden...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-[87.5%]">
        <div className="bg-yellow-50 border border-yellow-300 rounded-lg p-6 max-w-2xl mx-auto">
          <h3 className="text-lg font-medium text-yellow-800 mb-2">Inloggen vereist</h3>
          <p className="text-sm text-yellow-700">U moet ingelogd zijn om de simulatie te gebruiken.</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="container mx-auto px-4 py-8 max-w-[87.5%]">
        <div className="bg-red-50 border border-red-300 rounded-lg p-6 max-w-2xl mx-auto">
          <h3 className="text-lg font-medium text-red-800 mb-2">Geen toegang</h3>
          <p className="text-sm text-red-700">Alleen fietsberaad admins hebben toegang tot de simulatie.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8 max-w-[87.5%]">
      <div className="flex items-center justify-between gap-4 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Parkeer Simulatie</h1>
        <SimulationClockOverlay />
      </div>
      <ParkingManagementDashboard />
    </div>
  );
};

export default ParkingSimulationPage;
