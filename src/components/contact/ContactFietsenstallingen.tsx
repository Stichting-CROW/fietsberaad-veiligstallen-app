import React, { useEffect, useState } from 'react';
import type { VSFietsenstallingType } from "~/types/parking";
import type { VSContact } from "~/types/contacts";
import type { VSParking } from "~/types/parking";

interface ContactFietsenstallingenProps {
  contact: VSContact | undefined;
  fietsenstallingtypen: VSFietsenstallingType[] | undefined;
  onEditStalling: (stallingID: string | undefined) => void;
}

const ContactFietsenstallingen: React.FC<ContactFietsenstallingenProps> = ({ contact, fietsenstallingtypen, onEditStalling }) => {
  const [selectedType, setSelectedType] = useState<false | string | undefined>(undefined); // false is for all

  // Create filter options based on available types
  const availableTypes = fietsenstallingtypen?.filter(type => 
    contact?.managesFietsenstallingen?.some(fietsenstalling => fietsenstalling.Type === type.id)
  );

  // Set default selected type to the one with the lowest sequence value
  useEffect(() => {
    if (availableTypes && availableTypes.length > 0 && selectedType === undefined) {
      const defaultType = availableTypes.reduce((prev, current) => 
        (prev.sequence < current.sequence ? prev : current)
      );
      setSelectedType(defaultType.id);
    }
  }, [availableTypes]);

  const filteredFietsenstallingen = contact?.managesFietsenstallingen?.filter(fietsenstalling => 
    selectedType === false || fietsenstalling.Type === selectedType
  );

  const handleUpdateParking = () => {
    console.log("handleUpdateParking");
  };

  const handleRemoveParking = (message: string) => {
    console.log("handleRemoveParking", message);
  };

  const handleClose = (close: boolean) => {
    console.log("handleClose", close);
  };

  return (
    <div>
      <div className="flex justify-between my-2">
        <div className="flex">
        <button
              key="alle"
              onClick={() => setSelectedType(false)}
              className={`mx-1 py-2 px-4 rounded ${selectedType === false ? 'bg-blue-500' : 'bg-gray-300'}`}
            >
              Alle
            </button>
          {availableTypes?.sort((a, b) => a.sequence - b.sequence).map(type => (
            <button
              key={type.id}
              onClick={() => setSelectedType(type.id)}
              className={`mx-1 py-2 px-4 rounded ${selectedType === type.id ? 'bg-blue-500' : 'bg-gray-300'}`}
            >
              {type.name}
            </button>
          ))}
        </div>
        <button className="bg-green-500 hover:bg-green-700 text-white font-bold py-2 px-4 rounded">Stalling Toevoegen</button>
      </div>
      
      <div className="overflow-auto max-h-60">
        <table className="min-w-full bg-white">
          <thead>
            <tr>
              <th className="py-2">Naam</th>
              { selectedType === false && <th className="py-2">Type</th>}
              <th className="py-2">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredFietsenstallingen?.map((fietsenstalling: VSParking) => (
              <tr key={'fietsenstalling-' + fietsenstalling.ID}>
                <td className="border px-4 py-2">{fietsenstalling.Title}</td>
                { selectedType === false && <td className="border px-4 py-2">{fietsenstallingtypen?.find(type => type.id === fietsenstalling.Type)?.name}</td>}
                <td className="border px-4 py-2">
                  <button className="text-yellow-500 mx-1 disabled:opacity-40" onClick={() => onEditStalling(fietsenstalling.ID)}>✏️</button>
                  <button className="text-red-500 mx-1 disabled:opacity-40">🗑️</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
};

export default ContactFietsenstallingen;
