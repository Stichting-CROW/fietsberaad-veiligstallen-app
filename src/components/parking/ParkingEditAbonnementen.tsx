import React from "react";
import SectionBlock from "~/components/SectionBlock";
import { LoadingSpinner } from "../beheer/common/LoadingSpinner";
import type { VSAbonnementsvormInLijst } from "~/types/abonnementsvormen";
import toast from "react-hot-toast";

type ParkingEditAbonnementenProps = {
  parkingId: string;
  parkingType?: string | null;
  canEdit: boolean;
};

const formatPrice = (price: number | null) => {
  if (price === null || price === undefined) {
    return "-";
  }
  return `€ ${price.toFixed(2).replace(".", ",")}`;
};

const ParkingEditAbonnementen: React.FC<ParkingEditAbonnementenProps> = ({
  parkingId,
  parkingType,
  canEdit,
}) => {
  const [available, setAvailable] = React.useState<VSAbonnementsvormInLijst[]>([]);
  const [selectedIDs, setSelectedIDs] = React.useState<number[]>([]);
  const [isLoading, setIsLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [isSaving, setIsSaving] = React.useState(false);

  React.useEffect(() => {
    if (!parkingId) {
      return;
    }

    let cancelled = false;

    const fetchAbonnementData = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const parkingTypeParam = parkingType
          ? `?parkingType=${encodeURIComponent(parkingType)}`
          : "";

        const [listResponse, selectedResponse] = await Promise.all([
          fetch(`/api/protected/abonnementsvormen${parkingTypeParam}`),
          fetch(`/api/protected/fietsenstallingen/${parkingId}/abonnementsvormen`),
        ]);

        if (!listResponse.ok) {
          throw new Error("Fout bij het ophalen van abonnementsvormen");
        }

        const listJson = await listResponse.json();
        const listData: VSAbonnementsvormInLijst[] = listJson.data || [];

        let selectedIds: number[] = [];
        if (selectedResponse.ok) {
          const selectedJson = await selectedResponse.json();
          selectedIds = selectedJson.data || [];
        }

        if (!cancelled) {
          setAvailable(listData);
          setSelectedIDs(selectedIds);
        }
      } catch (fetchError) {
        console.error("Error fetching abonnementsvormen:", fetchError);
        if (!cancelled) {
          setError(
            fetchError instanceof Error
              ? fetchError.message
              : "Fout bij het ophalen van abonnementsvormen",
          );
          setAvailable([]);
          setSelectedIDs([]);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    fetchAbonnementData();

    return () => {
      cancelled = true;
    };
  }, [parkingId, parkingType]);

  const handleToggleSelection = async (abonnementId: number, checked: boolean) => {
    if (!parkingId || isSaving || !canEdit) {
      return;
    }

    const previousSelection = selectedIDs;
    const nextSelection = checked
      ? Array.from(new Set([...previousSelection, abonnementId]))
      : previousSelection.filter(id => id !== abonnementId);

    setSelectedIDs(nextSelection);
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/protected/fietsenstallingen/${parkingId}/abonnementsvormen`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ subscriptionTypeIDs: nextSelection }),
      });

      if (!response.ok) {
        throw new Error("Fout bij het opslaan van abonnementsvormen");
      }
    } catch (saveError) {
      console.error("Error updating abonnementsvormen:", saveError);
      setError(
        saveError instanceof Error ? saveError.message : "Fout bij het opslaan van abonnementsvormen",
      );
      setSelectedIDs(previousSelection);
      toast.error(saveError instanceof Error ? saveError.message : "Fout bij het opslaan van abonnementsvormen");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <>
      <SectionBlock heading="Abonnementen">
        {isLoading ? (
          <div className="py-4">
            <LoadingSpinner message="Abonnementen laden..." />
          </div>
        ) : error ? (
          <div className="text-red-600">{error}</div>
        ) : available.length === 0 ? (
          <div className="text-gray-600">
            Geen abonnementsvormen beschikbaar
          </div>
        ) : (
          <div className="flex-1">
            <div>
              {available.map(option => (
                <div key={option.ID}>
                  <label
                    className={`block py-1 ${
                      canEdit && !isSaving
                        ? "cursor-pointer hover:bg-gray-100"
                        : "cursor-not-allowed opacity-50"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="mr-2 inline-block"
                      checked={selectedIDs.includes(option.ID)}
                      onChange={e => handleToggleSelection(option.ID, e.target.checked)}
                      disabled={!canEdit || isSaving}
                    />
                    <span className="font-semibold">
                      {option.naam || "Naam onbekend"}
                    </span>
                    {option.allowedBikeTypes && option.allowedBikeTypes.length > 0 && (
                      <span className="ml-2 text-sm text-gray-500">
                        ({option.allowedBikeTypes.join(", ")})
                      </span>
                    )}
                    <span className="ml-2 text-sm text-gray-700">
                      {formatPrice(option.prijs)}
                    </span>
                  </label>
                </div>
              ))}
              {isSaving && (
                <div className="py-2 text-sm text-gray-500">
                  Wijzigingen opslaan...
                </div>
              )}
            </div>
          </div>
        )}
      </SectionBlock>
    </>
  );
};

export default ParkingEditAbonnementen;

