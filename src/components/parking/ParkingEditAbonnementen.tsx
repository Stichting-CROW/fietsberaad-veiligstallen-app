import React from "react";
import SectionBlock from "~/components/SectionBlock";
import { LoadingSpinner } from "../beheer/common/LoadingSpinner";
import type { VSAbonnementsvormInLijst } from "~/types/abonnementsvormen";

type ParkingEditAbonnementenProps = {
  visible: boolean;
  available: VSAbonnementsvormInLijst[];
  selectedIDs: number[];
  onToggleSelection: (id: number, checked: boolean) => void;
  isSaving: boolean;
  isLoading: boolean;
  error: string | null;
  canEdit: boolean;
};

const formatPrice = (price: number | null) => {
  if (price === null || price === undefined) {
    return "-";
  }
  return `€ ${price.toFixed(2).replace(".", ",")}`;
};

const ParkingEditAbonnementen: React.FC<ParkingEditAbonnementenProps> = ({
  visible,
  available,
  selectedIDs,
  onToggleSelection,
  isSaving,
  isLoading,
  error,
  canEdit,
}) => {
  return (
    <div
      className="mt-10 flex w-full flex-col"
      style={{ display: visible ? "flex" : "none" }}
    >
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
                      onChange={e => onToggleSelection(option.ID, e.target.checked)}
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
    </div>
  );
};

export default ParkingEditAbonnementen;

