import React, { useState, useEffect } from "react";
import { type VSTariefcode } from "~/types/tariefcodes";
import FormInput from "~/components/Form/FormInput";
import { Button } from "~/components/Button";
import { Table } from "~/components/common/Table";
import Modal from "~/components/Modal";
import SectionBlock from "~/components/SectionBlock";

const TariefcodesTable: React.FC = () => {
  const [tariefcodes, setTariefcodes] = useState<VSTariefcode[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingTariefcodeId, setEditingTariefcodeId] = useState<number | null>(null);
  const [editedTariefcode, setEditedTariefcode] = useState<VSTariefcode | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  // Load tariefcodes on mount
  useEffect(() => {
    loadTariefcodes();
  }, []);

  const loadTariefcodes = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/protected/tariefcodes");
      const result = await response.json();
      if (result.data) {
        setTariefcodes(result.data);
      } else if (result.error) {
        setError(result.error);
      }
    } catch (error) {
      console.error("Error loading tariefcodes:", error);
      setError("Fout bij het laden van tariefcodes");
    } finally {
      setIsLoading(false);
    }
  };


  const handleEdit = (tariefcode: VSTariefcode) => {
    setEditedTariefcode({ ...tariefcode });
    setEditingTariefcodeId(tariefcode.ID);
    setIsCreating(false);
  };

  const handleCreate = () => {
    setEditedTariefcode({
      ID: 0,
      Omschrijving: "",
    });
    setEditingTariefcodeId(0);
    setIsCreating(true);
  };

  const handleCancelEdit = () => {
    setEditedTariefcode(null);
    setEditingTariefcodeId(null);
    setIsCreating(false);
  };

  const updateEditedTariefcode = (field: keyof VSTariefcode, value: any) => {
    if (!editedTariefcode) return;
    setEditedTariefcode({ ...editedTariefcode, [field]: value });
  };

  const handleSaveEdit = async () => {
    if (!editedTariefcode) return;

    try {
      setError(null);
      let response;
      
      if (isCreating) {
        response = await fetch("/api/protected/tariefcodes", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            Omschrijving: editedTariefcode.Omschrijving,
          }),
        });
      } else {
        response = await fetch(`/api/protected/tariefcodes/${editedTariefcode.ID}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(editedTariefcode),
        });
      }

      if (response.ok) {
        await loadTariefcodes();
        setEditingTariefcodeId(null);
        setEditedTariefcode(null);
        setIsCreating(false);
      } else {
        const result = await response.json();
        setError(result.error || "Fout bij het opslaan");
      }
    } catch (error) {
      console.error("Error saving tariefcode:", error);
      setError("Fout bij het opslaan");
    }
  };

  const handleDelete = async (tariefcodeId: number) => {
    if (!confirm("Weet u zeker dat u deze tariefcode wilt verwijderen?")) {
      return;
    }

    try {
      setError(null);
      const response = await fetch(`/api/protected/tariefcodes/${tariefcodeId}`, {
        method: "DELETE",
      });

      if (response.ok) {
        await loadTariefcodes();
        setError(null);
      } else {
        const result = await response.json();
        // Show the error message from the API (which includes the specific message about in-use)
        setError(result.error || "Fout bij het verwijderen");
      }
    } catch (error) {
      console.error("Error deleting tariefcode:", error);
      setError("Fout bij het verwijderen");
    }
  };

  const handleSeedDefaults = async () => {
    if (!confirm("Weet u zeker dat u de tabel wilt vullen met de standaardwaarden? Dit voegt tariefcodes 0-5 toe.")) {
      return;
    }

    try {
      setError(null);
      setIsLoading(true);
      const response = await fetch("/api/protected/tariefcodes/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      });

      if (response.ok) {
        await loadTariefcodes();
        setError(null);
      } else {
        const result = await response.json();
        setError(result.error || "Fout bij het vullen met standaardwaarden");
      }
    } catch (error) {
      console.error("Error seeding default tariefcodes:", error);
      setError("Fout bij het vullen met standaardwaarden");
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return <div>Laden...</div>;
  }

  return (
    <div className="bg-gray-200 border-2 border-gray-400 p-2 pl-4 rounded mb-2">
      <h2 className="text-xl font-semibold mb-4">Tariefcodes Tabel</h2>
      <div>
        <span className="text-sm text-gray-500">Deze teksten worden gebruikt bij compacte weergaven van stallingen.</span>
        <br/>
        <span className="text-sm text-gray-500">Gedetailleerde informatie van tarieven wordt elders ingevuld.</span>
        <br/><br/>
        <span className="text-sm text-gray-500">Code 0 wordt gebruikt voor stallingen waarvan de tariefcode (nog) niet ingevuld is.</span>
      </div>
      
      {error && (
        <div className="mt-4 p-2 bg-red-100 border border-red-400 text-red-700 rounded">
          {error}
        </div>
      )}

      {tariefcodes.length === 0 && (
        <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded">
          <p className="mb-4 text-gray-700">
            De tariefcodes tabel is leeg. Klik op de knop hieronder om de tabel te vullen met standaardwaarden.
          </p>
          <Button onClick={isLoading ? undefined : handleSeedDefaults}>
            {isLoading ? "Bezig..." : "Vul met standaardwaarden"}
          </Button>
        </div>
      )}

      {tariefcodes.length > 0 && (
        <div className="mt-4 overflow-x-auto">
          <Table
            columns={[
              {
                header: "ID",
                accessor: (tariefcode: VSTariefcode) => tariefcode.ID,
              },
              {
                header: "Omschrijving",
                accessor: (tariefcode: VSTariefcode) => tariefcode.Omschrijving,
              },
              {
                header: "Actie",
                accessor: (tariefcode: VSTariefcode) => (
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleEdit(tariefcode);
                      }}
                      className="text-yellow-500 hover:text-yellow-700 disabled:opacity-40"
                      title="Bewerken"
                    >
                      ✏️
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDelete(tariefcode.ID);
                      }}
                      className="text-red-500 hover:text-red-700 disabled:opacity-40 disabled:cursor-not-allowed"
                      title="Verwijderen"
                    >
                      🗑️
                    </button>
                  </div>
                ),
              },
            ]}
            data={tariefcodes}
            className="min-w-full bg-white"
          />
        </div>
      )}

      {/* Add new tariefcode */}
      {tariefcodes.length > 0 && (
        <div className="mt-4">
          <Button onClick={handleCreate}>
            Nieuwe tariefcode toevoegen
          </Button>
        </div>
      )}

      {/* Edit/Create tariefcode dialog */}
      {(editingTariefcodeId !== null || isCreating) && editedTariefcode && (
        <Modal onClose={handleCancelEdit} clickOutsideClosesDialog={false}>
          <div className="space-y-4">
            <SectionBlock heading={isCreating ? "Nieuwe tariefcode" : "Tariefcode bewerken"}>
              <div className="space-y-4">
                {/* Warning message */}
                <div className="p-3 bg-yellow-100 border border-yellow-400 text-yellow-800 rounded">
                  <strong>Let op:</strong> Deze wijzigingen gelden voor alle bestaande stallingen
                </div>

                {!isCreating && (
                  <div>
                    <label className="block text-sm font-medium mb-1">ID:</label>
                    <FormInput
                      type="text"
                      value={editedTariefcode.ID}
                      disabled={true}
                      className="border-gray-700 rounded-full"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-sm font-medium mb-1">Omschrijving:</label>
                  <FormInput
                    type="text"
                    value={editedTariefcode.Omschrijving}
                    onChange={(e) => updateEditedTariefcode("Omschrijving", e.target.value)}
                    className="border-gray-700 rounded-full"
                    required
                  />
                </div>
              </div>
            </SectionBlock>

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

export default TariefcodesTable;

