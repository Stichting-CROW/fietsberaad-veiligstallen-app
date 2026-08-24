import React, { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { useSession } from "next-auth/react";
import type { VSContactExploitant, VSContactGemeenteInLijst } from "~/types/contacts";
import { isFietsberaadSuperadminViewingAsOrganisation } from "~/types/utils";
import { getOrganisationByID } from "~/utils/organisations";

type FietsberaadSuperadminAccessDeniedProps = {
  organisationName?: string;
  gemeenten?: VSContactGemeenteInLijst[];
  exploitanten?: VSContactExploitant[];
  withPageContainer?: boolean;
};

async function fetchOrganisationName(contactId: string): Promise<string | null> {
  try {
    const gemeenteResponse = await fetch(`/api/protected/gemeenten/${contactId}`);
    if (gemeenteResponse.ok) {
      const gemeenteResult = (await gemeenteResponse.json()) as { data?: { CompanyName?: string } };
      if (gemeenteResult.data?.CompanyName) {
        return gemeenteResult.data.CompanyName;
      }
    }

    const exploitantResponse = await fetch(`/api/protected/exploitant/${contactId}`);
    if (exploitantResponse.ok) {
      const exploitantResult = (await exploitantResponse.json()) as { data?: { CompanyName?: string } };
      if (exploitantResult.data?.CompanyName) {
        return exploitantResult.data.CompanyName;
      }
    }
  } catch {
    /* ignore */
  }

  return null;
}

const FietsberaadSuperadminAccessDenied: React.FC<FietsberaadSuperadminAccessDeniedProps> = ({
  organisationName: organisationNameProp,
  gemeenten,
  exploitanten,
  withPageContainer = true,
}) => {
  const router = useRouter();
  const { data: session, update: updateSession } = useSession();
  const [organisationName, setOrganisationName] = useState<string | null>(organisationNameProp ?? null);
  const [isSwitching, setIsSwitching] = useState(false);

  const viewingAsOrganisation = isFietsberaadSuperadminViewingAsOrganisation(
    session?.user?.securityProfile,
    session?.user?.mainContactId,
    session?.user?.activeContactId
  );

  const activeContactId = session?.user?.activeContactId;

  useEffect(() => {
    if (organisationNameProp) {
      setOrganisationName(organisationNameProp);
      return;
    }

    if (!viewingAsOrganisation || !activeContactId) {
      setOrganisationName(null);
      return;
    }

    const fromLists = getOrganisationByID(
      [...(gemeenten ?? []), ...(exploitanten ?? [])],
      activeContactId
    )?.CompanyName;

    if (fromLists) {
      setOrganisationName(fromLists);
      return;
    }

    let cancelled = false;
    void fetchOrganisationName(activeContactId).then((name) => {
      if (!cancelled) {
        setOrganisationName(name);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [
    activeContactId,
    exploitanten,
    gemeenten,
    organisationNameProp,
    viewingAsOrganisation,
  ]);

  const handleSwitchToFietsberaad = async () => {
    if (!session) return;

    setIsSwitching(true);
    try {
      const response = await fetch("/api/security/switch-contact", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ contactId: "1" }),
      });

      if (!response.ok) {
        alert("Het wisselen van contact is niet gelukt");
        return;
      }

      const { user } = await response.json();
      await updateSession({
        ...session,
        user,
      });
      void router.reload();
    } catch (error) {
      console.error("Error switching to Fietsberaad:", error);
      alert("Het wisselen van contact is niet gelukt");
    } finally {
      setIsSwitching(false);
    }
  };

  const organisationLabel = organisationName ?? activeContactId ?? "deze organisatie";

  const content = (
    <div className="bg-red-50 border border-red-300 rounded-lg p-6 max-w-2xl mx-auto">
      <h3 className="text-lg font-medium text-red-800 mb-2">Geen toegang</h3>
      {viewingAsOrganisation ? (
        <>
          <p className="text-sm text-red-700 mb-4">
            Alleen Fietsberaad superadmins hebben toegang tot deze pagina. Je bekijkt het VeiligStallen
            beheer nu als <strong>{organisationLabel}</strong>. Wil je wisselen naar Fietsberaad, zodat je
            de pagina die nu open staat kunt bekijken?
          </p>
          <button
            type="button"
            onClick={() => void handleSwitchToFietsberaad()}
            disabled={isSwitching}
            className="inline-flex h-10 items-center justify-center rounded-lg bg-red-700 px-4 text-sm font-semibold text-white shadow-sm transition hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {isSwitching ? "Wisselen..." : "Bekijk als Fietsberaad"}
          </button>
        </>
      ) : (
        <p className="text-sm text-red-700">
          Alleen Fietsberaad superadmins hebben toegang tot deze pagina.
        </p>
      )}
    </div>
  );

  if (!withPageContainer) {
    return content;
  }

  return <div className="container mx-auto px-4 py-8">{content}</div>;
};

export default FietsberaadSuperadminAccessDenied;
