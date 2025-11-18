import React, { useState, useEffect } from "react";
import { type SectieDetailsType, type SectieFietstypeType } from "~/types/secties";
import { VSFietsTypenWaarden } from "~/types/fietstypen";
import SectionBlockEdit from "~/components/SectionBlockEdit";
import FormInput from "~/components/Form/FormInput";
import FormCheckbox from "~/components/Form/FormCheckbox";
import { Button } from "~/components/Button";
import { Table } from "~/components/common/Table";
import Modal from "~/components/Modal";

type SectiesManagementNewProps = {
  fietsenstallingId: string | null;
  fietsenstallingType: string | null;
};

const SectiesManagementNew: React.FC<SectiesManagementNewProps> = ({
  fietsenstallingId,
  fietsenstallingType,
}) => {
  const [secties, setSecties] = useState<SectieDetailsType[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<number | null>(null);
  const [editedSection, setEditedSection] = useState<SectieDetailsType | null>(null);

  // Load sections on mount
  useEffect(() => {
    if (!fietsenstallingId) return;

    const loadSecties = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(
          `/api/protected/fietsenstallingen/secties/all?fietsenstallingId=${fietsenstallingId}`
        );
        const result = await response.json();
        if (result.data) {
          setSecties(result.data);
        }
      } catch (error) {
        console.error("Error loading secties:", error);
      } finally {
        setIsLoading(false);
      }
    };

    loadSecties();
  }, [fietsenstallingId]);

  const calculateSectionCapacity = (sectie: SectieDetailsType): number => {
    return sectie.secties_fietstype
      .filter((bt) => bt.Toegestaan === true)
      .reduce((sum, bt) => sum + (bt.Capaciteit || 0), 0);
  };

  const getQualificationLabel = (qualificatie: string | null): string => {
    const isBuurtstalling = fietsenstallingType === "buurtstalling" || fietsenstallingType === "fietstrommel";
    if (qualificatie === "ABOVE") {
      return "Bovenrek";
    }
    return isBuurtstalling ? "Onderrek" : "Boven- en onderrek";
  };

  const getQualificationOptions = () => {
    const isBuurtstalling = fietsenstallingType === "buurtstalling" || fietsenstallingType === "fietstrommel";
    return isBuurtstalling
      ? [
          { value: "NONE", label: "Onderrek" },
          { value: "ABOVE", label: "Bovenrek" },
        ]
      : [
          { value: "NONE", label: "Boven- en onderrek" },
          { value: "ABOVE", label: "Bovenrek" },
        ];
  };

  const handleEdit = (sectie: SectieDetailsType) => {
    setEditedSection({ ...sectie });
    setEditingSectionId(sectie.sectieId);
  };

  const handleCancelEdit = () => {
    setEditedSection(null);
    setEditingSectionId(null);
  };

  const updateEditedSection = (field: keyof SectieDetailsType, value: any) => {
    if (!editedSection) return;
    setEditedSection({ ...editedSection, [field]: value });
  };

  const updateEditedBikeTypeCapacity = (
    bikeTypeID: number,
    field: "Capaciteit" | "Toegestaan",
    value: number | boolean
  ) => {
    if (!editedSection) return;
    
    const existingEntry = editedSection.secties_fietstype.find(
      (bt) => bt.BikeTypeID === bikeTypeID
    );
    
    if (existingEntry) {
      // Update existing entry
      setEditedSection({
        ...editedSection,
        secties_fietstype: editedSection.secties_fietstype.map((bt) =>
          bt.BikeTypeID === bikeTypeID ? { ...bt, [field]: value } : bt
        ),
      });
    } else {
      // Create new entry if it doesn't exist
      const bikeType = VSFietsTypenWaarden.find((bt) => bt.ID === bikeTypeID);
      const newEntry: SectieFietstypeType = {
        SectionBiketypeID: 0, // Temporary ID for new entries, backend will assign real ID
        BikeTypeID: bikeTypeID,
        Capaciteit: field === "Capaciteit" ? (value as number) : null,
        Toegestaan: field === "Toegestaan" ? (value as boolean) : true,
        sectieID: editedSection.sectieId,
        fietstype: bikeType
          ? {
              ID: bikeType.ID,
              Name: bikeType.Name,
              naamenkelvoud: bikeType.naamenkelvoud || "",
            }
          : null,
      };
      setEditedSection({
        ...editedSection,
        secties_fietstype: [...editedSection.secties_fietstype, newEntry],
      });
    }
  };

  const handleSaveEdit = async () => {
    if (!editedSection || !editingSectionId) return;

    try {
      const response = await fetch(`/api/protected/fietsenstallingen/secties/${editingSectionId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editedSection),
      });

      if (response.ok) {
        const result = await response.json();
        setSecties((prev) =>
          prev.map((s) => (s.sectieId === editingSectionId ? (result.data as SectieDetailsType) : s))
        );
        setEditingSectionId(null);
        setEditedSection(null);
      } else {
        alert("Fout bij opslaan van sectie");
      }
    } catch (error) {
      console.error("Error saving section:", error);
      alert("Fout bij opslaan van sectie");
    }
  };

  const deleteSection = async (sectieId: number) => {
    if (!confirm("Weet u zeker dat u deze sectie wilt verwijderen?")) return;

    try {
      const response = await fetch(`/api/protected/fietsenstallingen/secties/${sectieId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        setSecties((prev) => prev.filter((s) => s.sectieId !== sectieId));
        // Cancel edit if we're editing the deleted section
        if (editingSectionId === sectieId) {
          handleCancelEdit();
        }
      } else {
        const result = await response.json();
        const errorMessage = result.error || "Fout bij verwijderen van sectie";
        alert(errorMessage);
      }
    } catch (error) {
      console.error("Error deleting section:", error);
      alert("Fout bij verwijderen van sectie");
    }
  };

  const createNewSection = async () => {
    if (!fietsenstallingId) return;

    // Find the highest index in existing section names matching "Sectie xxx" pattern
    let highestIndex = 0;
    const sectieNamePattern = /^Sectie\s+(\d+)$/i;
    
    for (const sectie of secties) {
      if (!sectie.titel) continue;
      const match = sectie.titel.match(sectieNamePattern);
      if (match) {
        const index = parseInt(match[1] || "0", 10);
        if (!isNaN(index) && index > highestIndex) {
          highestIndex = index;
        }
      }
    }

    // Generate new section name: "Sectie {index+1}"
    const newSectionName = `Sectie ${highestIndex + 1}`;

    try {
      const response = await fetch(`/api/protected/fietsenstallingen/secties/new`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fietsenstallingsId: fietsenstallingId,
          titel: newSectionName,
          kleur: "00FF00",
          qualificatie: "NONE",
          isactief: true,
        }),
      });

      const result = await response.json();
      if (result.data) {
        const newSection = result.data as SectieDetailsType;
        setSecties((prev) => [...prev, newSection]);
        // Immediately open edit mode for the new section
        setEditedSection(newSection);
        setEditingSectionId(newSection.sectieId);
      }
    } catch (error) {
      console.error("Error creating section:", error);
      alert("Fout bij aanmaken van sectie");
    }
  };

  if (isLoading) {
    return <div>Laden...</div>;
  }

  // Show table view
  const totalCapacity = secties.reduce((sum, sectie) => sum + calculateSectionCapacity(sectie), 0);
  const showKenmerk = fietsenstallingType === "buurtstalling" ||  fietsenstallingType === "fietstrommel";

  return (
    <div className="space-y-4">
      {secties.length === 0 ? (
        <div className="text-base text-gray-700">
          Elke stalling heeft minimaal één sectie. Voeg svp een sectie toe.
        </div>
      ) : (
        <>
          <div className="text-lg font-medium">
            Totale capaciteit: {totalCapacity}
          </div>
          <div>
            <Table
          columns={[
            {
              header: "Naam",
              accessor: (sectie: SectieDetailsType) => sectie.titel,
            },
            {
              header: "Capaciteit",
              accessor: (sectie: SectieDetailsType) => calculateSectionCapacity(sectie),
            },
            {
              header: "Sectie ID",
              accessor: (sectie: SectieDetailsType) => sectie.externalId || sectie.sectieId.toString(),
            },
            {
              header: "Kenmerk",
              accessor: (sectie: SectieDetailsType) => getQualificationLabel(sectie.qualificatie),
              className: showKenmerk ? '' : 'hidden',
            },
            {
              header: "Kleur",
              accessor: (sectie: SectieDetailsType) => (
                <div className="flex items-center gap-2">
                  <div
                    className="w-6 h-6 border rounded"
                    style={{ backgroundColor: `#${sectie.kleur}` }}
                  />
                  <span>{sectie.kleur}</span>
                </div>
              ),
            },
            {
              header: "Actie",
              accessor: (sectie: SectieDetailsType) => (
                <div className="flex gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleEdit(sectie);
                    }}
                    className="text-yellow-500 hover:text-yellow-700 disabled:opacity-40"
                    title="Bewerken"
                  >
                    ✏️
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteSection(sectie.sectieId);
                    }}
                    disabled={secties.length <= 1}
                    className="text-red-500 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                    title={secties.length <= 1 ? "Kan de laatste sectie niet verwijderen" : "Verwijderen"}
                  >
                    🗑️
                  </button>
                </div>
              ),
            },
          ]}
          data={secties}
          className="min-w-full bg-white"
        />
          </div>
        </>
      )}

      {/* Add new section */}
      <div className="mt-4">
        <Button onClick={createNewSection}>
          Sectie toevoegen
        </Button>
      </div>

      {/* Edit section dialog */}
      {editingSectionId !== null && editedSection && (
        <Modal onClose={handleCancelEdit} clickOutsideClosesDialog={false}>
          <div className="space-y-4">
            <SectionBlockEdit>
              <div className="space-y-4">
                {/* Row 1: Naam and Sectie ID */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Naam:</label>
                    <FormInput
                      type="text"
                      value={editedSection.titel}
                      onChange={(e) => updateEditedSection("titel", e.target.value)}
                      className="border-gray-700 rounded-full"
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium mb-1">Sectie ID:</label>
                    <FormInput
                      type="text"
                      value={editedSection.externalId || editedSection.sectieId.toString()}
                      disabled={true}
                      className="border-gray-700 rounded-full"
                    />
                  </div>
                </div>

                {/* Row 2: Kenmerk and Kleur */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium mb-1">Kleur:</label>
                    <div className="flex items-center gap-2">
                      <div
                        className="w-8 h-8 border rounded"
                        style={{ backgroundColor: `#${editedSection.kleur}` }}
                      />
                      <FormInput
                        type="text"
                        value={editedSection.kleur}
                        onChange={(e) => updateEditedSection("kleur", e.target.value)}
                        className="w-24 border-gray-700 rounded-full"
                        placeholder="00FF00"
                      />
                    </div>
                  </div>
                  { showKenmerk &&<div>
                      <label className="block text-sm font-medium mb-1">Kenmerk:</label>
                      <select
                        value={editedSection.qualificatie || "NONE"}
                        onChange={(e) => updateEditedSection("qualificatie", e.target.value)}
                        className="w-full px-3 py-2 mt-3 border border-gray-700 rounded-full"
                      >
                        {getQualificationOptions().map((option) => (
                          <option key={option.value} value={option.value}>
                            {option.label}
                          </option>
                        ))}
                      </select>
                  </div> }

                </div>

                {/* Row 3: Capaciteit */}
                <div>
                  <label className="block text-sm font-medium mb-1">
                    Capaciteit ({editedSection ? calculateSectionCapacity(editedSection) : 0}):
                  </label>
                  <div className="space-y-0">
                    {VSFietsTypenWaarden.map((bikeType) => {
                      const bikeTypeData = editedSection.secties_fietstype.find(
                        (bt) => bt.BikeTypeID === bikeType.ID
                      );
                      return { bikeType, bikeTypeData };
                    })
                      .sort((a, b) => {
                        const aAllowed = a.bikeTypeData?.Toegestaan !== false;
                        const bAllowed = b.bikeTypeData?.Toegestaan !== false;
                        
                        // First sort by toegestaan (toegestaan first, niet toegestaan last)
                        if (aAllowed !== bAllowed) {
                          return aAllowed ? -1 : 1;
                        }
                        
                        // Then sort by BikeTypeID
                        return a.bikeType.ID - b.bikeType.ID;
                      })
                      .map(({ bikeType, bikeTypeData }) => {
                        const isAllowed = bikeTypeData?.Toegestaan !== false;
                        const capacity = bikeTypeData?.Capaciteit ?? 0;

                        return (
                          <div key={bikeType.ID} className="flex items-center">
                            <div className="w-56 text-sm">{bikeType.Name?.toLowerCase()}</div>
                            <FormInput
                              type="number"
                              value={capacity}
                              onChange={(e) => {
                                const inputValue = e.target.value;
                                // Allow empty string for deletion
                                if (inputValue === "") {
                                  updateEditedBikeTypeCapacity(
                                    bikeType.ID,
                                    "Capaciteit",
                                    0
                                  );
                                  return;
                                }
                                const value = parseInt(inputValue) || 0;
                                // Ensure value is never negative
                                const validValue = Math.max(0, value);
                                updateEditedBikeTypeCapacity(
                                  bikeType.ID,
                                  "Capaciteit",
                                  validValue
                                );
                              }}
                              disabled={!isAllowed}
                              className="max-w-24 text-sm border-gray-700 rounded-full"
                            />
                            <FormCheckbox
                              checked={!isAllowed}
                              onChange={(e) =>
                                updateEditedBikeTypeCapacity(
                                  bikeType.ID,
                                  "Toegestaan",
                                  !e.target.checked
                                )
                              }
                            >
                              Niet toegestaan
                            </FormCheckbox>
                          </div>
                        );
                      })}
                  </div>
                </div>

                {/* Descriptive text */}
                <div className="text-sm text-gray-600">
                  Als er voor de capaciteit geen onderscheid wordt gemaakt in bijvoorbeeld
                  e-fietsen en normale fietsen, dan vult u geen waarde in bij e-fietsen. U kunt dan
                  nog wel onderscheid maken in de tarieven.
                </div>
              </div>
            </SectionBlockEdit>

            <div className="flex gap-2">
              <Button onClick={handleSaveEdit}>Opslaan</Button>
              <Button onClick={handleCancelEdit}>Afbreken</Button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};

export default SectiesManagementNew;
