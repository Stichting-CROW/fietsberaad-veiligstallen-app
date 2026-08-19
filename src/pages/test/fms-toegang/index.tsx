import React from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import Overzicht from "~/components/beheer/apis/Overzicht";
import { LoadingSpinner } from "~/components/beheer/common/LoadingSpinner";
import { canAccessFmsPermitsOverview } from "~/types/utils";

const FmsToegangOverzichtPage: React.FC = () => {
  const router = useRouter();
  const { data: session, status } = useSession();

  const hasAccess = canAccessFmsPermitsOverview(
    session?.user?.securityProfile,
    session?.user?.mainContactId
  );

  if (status === "loading") {
    return (
      <div className="container mx-auto px-4 py-8">
        <LoadingSpinner message="Laden..." />
      </div>
    );
  }

  if (!session) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-2xl rounded-lg border border-yellow-300 bg-yellow-50 p-6">
          <h3 className="mb-2 text-lg font-medium text-yellow-800">Inloggen vereist</h3>
          <p className="text-sm text-yellow-700">U moet ingelogd zijn om deze pagina te bekijken.</p>
        </div>
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="mx-auto max-w-2xl rounded-lg border border-red-300 bg-red-50 p-6">
          <h3 className="mb-2 text-lg font-medium text-red-800">Geen toegang</h3>
          <p className="text-sm text-red-700">
            Alleen Fietsberaad-superadmins en de RootAdmin van contact 1 hebben toegang tot het FMS-toegang overzicht.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-8">
      <div className="mb-6 flex items-center justify-between">
        <span />
        <button
          type="button"
          onClick={() => void router.push("/test")}
          className="rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          ← Terug naar test
        </button>
      </div>
      <Overzicht />
    </div>
  );
};

export default FmsToegangOverzichtPage;
