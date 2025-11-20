import React, { useEffect, useState } from 'react';
import Modal from '~/components/Modal';
import { useSession } from 'next-auth/react';
import type { VSAbonnementsvorm } from '~/types/abonnementsvormen';
import type { VSFietstype } from '~/types/fietstypen';
import type { VSmodules_contacts } from '~/types/modules-contacts';
import { useFietsenstallingtypen } from '~/hooks/useFietsenstallingtypen';
import { useExploitanten } from '~/hooks/useExploitanten';

type AbonnementsvormEditProps = {
  id: number | 'new';
  onClose: (success: boolean) => void;
};

type Documenttemplate = {
  ID: string;
  name: string | null;
};

const NO_EXPLOITANT_VALUE = "__VS_NO_EXPLOITANT__";

const AbonnementsvormEdit: React.FC<AbonnementsvormEditProps> = ({ id, onClose }) => {
  const isNew = id === 'new';
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Form state
  const [naam, setNaam] = useState('');
  const [tijdsduur, setTijdsduur] = useState<number | ''>('');
  const [prijs, setPrijs] = useState<number | ''>('');
  const [bikeparkTypeID, setBikeparkTypeID] = useState('');
  const [exploitantSiteID, setExploitantSiteID] = useState<string | null>(null);
  const [idmiddelen, setIdmiddelen] = useState<'sleutelhanger' | 'ovchipmetcode'>('sleutelhanger');
  const [isActief, setIsActief] = useState(true);
  const [conditionsID, setConditionsID] = useState<string | null>(null);
  const [contractID, setContractID] = useState<string | null>(null);
  const [paymentAuthorizationID, setPaymentAuthorizationID] = useState<string | null>(null);
  const [selectedBiketypeIDs, setSelectedBiketypeIDs] = useState<number[]>([]);

  // Options - use hooks for fietsenstallingtypen and exploitanten
  const { data: session } = useSession();
  const { fietsenstallingtypen } = useFietsenstallingtypen();
  // Pass undefined to get all exploitants for the current organization
  // The API will filter based on user access rights
  const { exploitanten, isLoading: exploitantenLoading, error: exploitantenError } = useExploitanten(session?.user?.activeContactId || undefined);
  const [fietstypen, setFietstypen] = useState<VSFietstype[]>([]);
  const [documenttemplates, setDocumenttemplates] = useState<Documenttemplate[]>([]);
  const [hasBuurtstallingenModule, setHasBuurtstallingenModule] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setIsLoading(true);

        // Fetch all required data in parallel (fietsenstallingtypen and exploitanten are fetched via hooks)
        const [avResponse, fietstypenResponse, templatesResponse, selectedFietstypenResponse] = await Promise.all([
          fetch(`/api/protected/abonnementsvormen/${id}`),
          fetch('/api/protected/fietstypen'),
          fetch('/api/protected/documenttemplates'),
          fetch(`/api/protected/abonnementsvormen/${id}/fietstypen`),
        ]);

        if (!avResponse.ok) throw new Error('Failed to fetch abonnementsvorm');
        if (!fietstypenResponse.ok) throw new Error('Failed to fetch fietstypen');
        if (!templatesResponse.ok) throw new Error('Failed to fetch documenttemplates');
        if (!selectedFietstypenResponse.ok) throw new Error('Failed to fetch selected fietstypen');

        const avData = await avResponse.json();
        const fietstypenData = await fietstypenResponse.json();
        const templatesData = await templatesResponse.json();
        const selectedFietstypenData = await selectedFietstypenResponse.json();

        setFietstypen(fietstypenData.data || []);
        setDocumenttemplates(templatesData.data || []);

        // Set form values
        if (avData.data) {
          setNaam(avData.data.naam || '');
          setTijdsduur(avData.data.tijdsduur || '');
          setPrijs(avData.data.prijs || '');
          setBikeparkTypeID(avData.data.bikeparkTypeID || '');
          setExploitantSiteID(avData.data.exploitantSiteID ?? null);
          setIdmiddelen(avData.data.idmiddelen === 'ovchipmetcode' ? 'ovchipmetcode' : 'sleutelhanger');
          setIsActief(avData.data.isActief);
          setConditionsID(avData.data.conditionsID);
          setContractID(avData.data.contractID);
          setPaymentAuthorizationID(avData.data.paymentAuthorizationID);
          setSelectedBiketypeIDs(selectedFietstypenData.data?.map((bt: VSFietstype) => bt.ID) || []);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Fout bij het laden van gegevens');
      } finally {
        setIsLoading(false);
      }
    };

    fetchData();
  }, [id]);

  useEffect(() => {
    const fetchModules = async () => {
      if (!session?.user?.activeContactId) {
        setHasBuurtstallingenModule(false);
        return;
      }

      try {
        const response = await fetch(`/api/protected/modules_contacts?contactId=${session.user.activeContactId}`);
        if (!response.ok) {
          throw new Error('Failed to fetch modules');
        }
        const modules: VSmodules_contacts[] = await response.json();
        setHasBuurtstallingenModule(modules.some(module => module.ModuleID === 'buurtstallingen'));
      } catch (err) {
        console.error('Error fetching modules:', err);
        setHasBuurtstallingenModule(false);
      }
    };

    fetchModules();
  }, [session?.user?.activeContactId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validation
    if (!naam.trim()) {
      setError('Naam is verplicht');
      return;
    }
    if (!tijdsduur || tijdsduur <= 0) {
      setError('Tijdsduur moet een positief getal zijn');
      return;
    }
    if (prijs === '' || prijs < 0) {
      setError('Prijs moet een positief getal zijn');
      return;
    }
    if (!bikeparkTypeID) {
      setError('Stallingstype is verplicht');
      return;
    }
    if (isNew && bikeparkTypeID !== 'fietskluizen' && selectedBiketypeIDs.length === 0) {
      setError('Selecteer minimaal één fietstype');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      const method = isNew ? 'POST' : 'PUT';
      const url = `/api/protected/abonnementsvormen/${id}`;
      
      const body: any = {
        naam: naam.trim(),
        tijdsduur: Number(tijdsduur),
        prijs: Number(prijs),
        bikeparkTypeID,
        exploitantSiteID,
        idmiddelen: idmiddelen,
        isActief,
        conditionsID: conditionsID || null,
      };

      // Only include biketypeIDs for new records
      if (isNew) {
        body.biketypeIDs = selectedBiketypeIDs;
      } else {
        // Only include contractID and paymentAuthorizationID when editing
        body.contractID = contractID || null;
        body.paymentAuthorizationID = paymentAuthorizationID || null;
      }

      const response = await fetch(url, {
        method,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const result = await response.json();
        throw new Error(result.error || 'Fout bij het opslaan');
      }

      onClose(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Fout bij het opslaan');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBiketypeToggle = (biketypeID: number) => {
    if (isNew) {
      setSelectedBiketypeIDs(prev => 
        prev.includes(biketypeID)
          ? prev.filter(id => id !== biketypeID)
          : [...prev, biketypeID]
      );
    }
  };

  const canSave = naam.trim() && tijdsduur && tijdsduur > 0 && prijs !== '' && prijs >= 0 && bikeparkTypeID;

  const selectedFietstypeNames = fietstypen
    .filter(fietstype => selectedBiketypeIDs.includes(fietstype.ID))
    .map(fietstype => fietstype.Name)
    .filter((name): name is string => Boolean(name));

  const isBuurtstallingType = bikeparkTypeID === 'buurtstalling' || bikeparkTypeID === 'fietstrommel';
  const hasDocumentTemplates = documenttemplates.length > 0;
  const showBuurtstallingDocuments = hasBuurtstallingenModule && (isNew || isBuurtstallingType) && hasDocumentTemplates;
  const showContractField = showBuurtstallingDocuments;
  const showMachtigingField = showBuurtstallingDocuments;
  const showVoorwaardenField = hasDocumentTemplates;

  if (isLoading) {
    return (
      <Modal onClose={() => onClose(false)} title={isNew ? "Nieuwe abonnementsvorm" : "Bewerk abonnementsvorm"}>
        <div className="p-4">Laden...</div>
      </Modal>
    );
  }

  return (
    <Modal onClose={() => onClose(false)} title={isNew ? "Nieuwe abonnementsvorm" : "Bewerk abonnementsvorm"}>
      <form onSubmit={handleSubmit} className="p-4">
        <h2 className="text-2xl font-bold mb-4">{isNew ? "Nieuwe abonnementsvorm" : "Bewerk abonnementsvorm"}</h2>
        {error && (
          <div className="mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {/* Naam */}
          <div>
            <label className="block text-sm font-medium mb-1">Naam:</label>
            <input
              type="text"
              value={naam}
              onChange={(e) => setNaam(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              required
            />
          </div>

          {/* Exploitant */}
          <div>
            <label className="block text-sm font-medium mb-1">Exploitant:</label>
            {exploitantenLoading ? (
              <div className="w-full px-3 py-2 border rounded-md bg-gray-50">Laden...</div>
            ) : exploitantenError ? (
              <div className="w-full px-3 py-2 border rounded-md bg-red-50 text-red-600">Fout: {exploitantenError}</div>
            ) : (
              <select
                value={exploitantSiteID === null ? NO_EXPLOITANT_VALUE : exploitantSiteID || ''}
                onChange={(e) => {
                  const selectedValue = e.target.value;
                  if (selectedValue === NO_EXPLOITANT_VALUE) {
                    setExploitantSiteID(null);
                  } else {
                    setExploitantSiteID(selectedValue || null);
                  }
                }}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value={NO_EXPLOITANT_VALUE}>Niet ingesteld</option>
                {exploitanten.map(exploitant => (
                  <option key={exploitant.ID} value={exploitant.ID}>
                    {exploitant.CompanyName}
                  </option>
                ))}
              </select>
            )}
          </div>

          {/* Stallingstype */}
          <div>
            <label className="block text-sm font-medium mb-1">Stallingstype:</label>
            <select
              value={bikeparkTypeID}
              onChange={(e) => setBikeparkTypeID(e.target.value)}
              className="w-full px-3 py-2 border rounded-md"
              disabled={!isNew}
              required
            >
              <option value="">Kies een stallingstype</option>
              {fietsenstallingtypen.map(type => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
          </div>

          {/* Tijdsduur */}
          <div>
            <label className="block text-sm font-medium mb-1">Tijdsduur abonnement:</label>
            <div className="flex items-center gap-2">
              <input
                type="number"
                value={tijdsduur}
                onChange={(e) => setTijdsduur(e.target.value === '' ? '' : Number(e.target.value))}
                className="px-3 py-2 border rounded-md w-24"
                min="1"
                required
              />
              <span>maanden</span>
            </div>
          </div>

          {/* Prijs */}
          <div>
            <label className="block text-sm font-medium mb-1">Prijs:</label>
            <div className="flex items-center gap-2">
              <span>€</span>
              <input
                type="number"
                step="0.01"
                value={prijs}
                onChange={(e) => setPrijs(e.target.value === '' ? '' : Number(e.target.value))}
                className="px-3 py-2 border rounded-md w-32"
                min="0"
                required
              />
            </div>
          </div>

          {/* ID-middel */}
          <div>
            <label className="block text-sm font-medium mb-1">ID-middel:</label>
            {isNew ? (
              <div className="flex space-x-4">
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="idmiddelen"
                    value="sleutelhanger"
                    checked={idmiddelen === 'sleutelhanger'}
                    onChange={(e) => setIdmiddelen('sleutelhanger')}
                    className="mr-2"
                  />
                  Sleutelhanger
                </label>
                <label className="flex items-center">
                  <input
                    type="radio"
                    name="idmiddelen"
                    value="ovchipmetcode"
                    checked={idmiddelen === 'ovchipmetcode'}
                    onChange={(e) => setIdmiddelen('ovchipmetcode')}
                    className="mr-2"
                  />
                  OV-kaart met code
                </label>
              </div>
            ) : (
              <div className="px-3 py-2 border rounded-md bg-gray-50">
                {idmiddelen === 'ovchipmetcode' ? 'OV-kaart met code' : 'Sleutelhanger'}
              </div>
            )}
          </div>

          {/* Fietstype */}
          <div>
            {isNew  ? (
              <>
                <label className="block text-sm font-medium mb-1">Fietstype:</label>
                <div className="grid grid-cols-2 gap-2 max-h-64 overflow-y-auto border rounded-md p-2">
                  {fietstypen.map(fietstype => {
                    const isSelected = selectedBiketypeIDs.includes(fietstype.ID);
                    return (
                      <label key={fietstype.ID} className="flex items-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleBiketypeToggle(fietstype.ID)}
                          className="mr-2"
                        />
                        {fietstype.Name}
                      </label>
                    );
                  })}
                </div>
                <p className="text-sm text-gray-500 mt-1">Selecteer minimaal één fietstype</p>
              </>
            ) : (
              selectedFietstypeNames.length > 0 && 
                <>
                  <label className="block text-sm font-medium mb-1">Fietstype:</label>
                  <div className="px-3 py-2 border rounded-md bg-gray-50">
                      {selectedFietstypeNames.join(', ')}
                  </div>
                </> 
            )}
          </div>

          {/* Actief */}
          <div>
            <label className="flex items-center">
              <input
                type="checkbox"
                checked={isActief}
                onChange={(e) => setIsActief(e.target.checked)}
                className="mr-2"
              />
              Actief
            </label>
          </div>

          {/* Contract */}
          {showContractField && (
            <div>
              <label className="block text-sm font-medium mb-1">Contract:</label>
              <select
                value={contractID || ''}
                onChange={(e) => setContractID(e.target.value || null)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">Kies een document</option>
                {documenttemplates.map(template => (
                  <option key={template.ID} value={template.ID}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Machtiging */}
          {showMachtigingField && (
            <div>
              <label className="block text-sm font-medium mb-1">Machtiging:</label>
              <select
                value={paymentAuthorizationID || ''}
                onChange={(e) => setPaymentAuthorizationID(e.target.value || null)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">Kies een document</option>
                {documenttemplates.map(template => (
                  <option key={template.ID} value={template.ID}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {/* Voorwaarden */}
          {showVoorwaardenField && (
            <div>
              <label className="block text-sm font-medium mb-1">Voorwaarden:</label>
              <select
                value={conditionsID || ''}
                onChange={(e) => setConditionsID(e.target.value || null)}
                className="w-full px-3 py-2 border rounded-md"
              >
                <option value="">Kies een template</option>
                {documenttemplates.map(template => (
                  <option key={template.ID} value={template.ID}>
                    {template.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={() => onClose(false)}
            className="px-4 py-2 border rounded-md hover:bg-gray-100"
            disabled={isSaving}
          >
            Annuleren
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-green-500 text-white rounded-md hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
            disabled={!canSave || isSaving}
          >
            {isSaving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </form>
    </Modal>
  );
};

export default AbonnementsvormEdit;

