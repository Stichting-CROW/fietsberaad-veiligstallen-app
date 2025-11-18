import React from "react";
import SectionBlockEdit from "~/components/SectionBlockEdit";
import FormSelect from "~/components/Form/FormSelect";
import FormInput from "~/components/Form/FormInput";
import { useExploitanten } from "~/hooks/useExploitanten";
import { useGemeente } from "~/hooks/useGemeente";
import { getSectionBlockBeheerder } from "./ParkingViewBeheerder";

interface ParkingEditBeheerderProps {
  visible?: boolean;
  newExploitantID: string | undefined;
  setNewExploitantID: (id: string) => void;
  parkingdata: any;
  canEditAllFields: boolean;
  newBeheerder: string | undefined;
  setNewBeheerder: (val: string) => void;
  newBeheerderContact: string | undefined;
  setNewBeheerderContact: (val: string) => void;
}

const ParkingEditBeheerder: React.FC<ParkingEditBeheerderProps> = ({
  visible = false,
  newExploitantID,
  setNewExploitantID,
  parkingdata,
  canEditAllFields,
  newBeheerder,
  setNewBeheerder,
  newBeheerderContact,
  setNewBeheerderContact,
}) => {
  // Use the hook for exploitanten
  const { exploitanten, isLoading: isLoadingExploitanten, error: errorExploitanten } = useExploitanten(parkingdata.SiteID || undefined);
  const { gemeente, isLoading: isLoadingGemeente, error: errorGemeente } = useGemeente(parkingdata.SiteID || "");

  if (isLoadingExploitanten || isLoadingGemeente) {
    return (
      <div className="flex justify-between" style={{ display: visible ? "flex" : "none" }}>
        <div data-name="content-left" className="sm:mr-12">
          <SectionBlockEdit>
            <div className="mt-4 w-full">
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                <p className="mt-2 text-gray-600">Laden...</p>
              </div>
            </div>
          </SectionBlockEdit>
        </div>
      </div>
    );
  }

  if (errorExploitanten || errorGemeente) {
    return (
      <div className="flex justify-between" style={{ display: visible ? "flex" : "none" }}>
        <div data-name="content-left" className="sm:mr-12">
          <SectionBlockEdit>
            <div className="mt-4 w-full">
              <div className="text-center py-8">
                <p className="text-red-600">Fout bij het laden: {errorExploitanten || errorGemeente}</p>
              </div>
            </div>
          </SectionBlockEdit>
        </div>
      </div>
    );
  }

  const selectedExploitantID =
    newExploitantID !== undefined
      ? newExploitantID
      : parkingdata.ExploitantID === null
      ? "anders"
      : parkingdata.ExploitantID;

  const exploitantOptions: { label: string; value: string | undefined }[] = [
    { label: "Anders", value: "anders" },
  ];

  exploitantOptions.push({
    label: `Eigen gemeente`,
    value: parkingdata.SiteID,
  });

  exploitanten.forEach((exp) => {
    exploitantOptions.push({
      label: exp.CompanyName || "Onbekende exploitant",
      value: exp.ID,
    });
  });

  const showBeheerderInput = selectedExploitantID === "anders";

  let currentBeheerderName = "";
  let currentBeheerderContact = "";

  // derive current beheerder name and contact from the selected organization
  if(selectedExploitantID === parkingdata.SiteID) {
    currentBeheerderName = gemeente?.CompanyName || `Gemeente ${parkingdata.SiteID}`;
    currentBeheerderContact = gemeente?.Helpdesk ? gemeente.Helpdesk : '';
  } else if(selectedExploitantID!=='anders') {
    const currentExploitant = exploitanten.find(exp => exp.ID === selectedExploitantID);
    currentBeheerderName = currentExploitant?.CompanyName || "";
    currentBeheerderContact = currentExploitant?.Helpdesk ? currentExploitant.Helpdesk : '';
  } else {
    currentBeheerderName = newBeheerder || "";
    currentBeheerderContact = newBeheerderContact || "";
  }


  return (
    <div className="flex justify-between" style={{ display: visible ? "flex" : "none" }}>
      <div data-name="content-left" className="sm:mr-12">
        <SectionBlockEdit>
          <div className="mt-4 w-full">
            {/* Row 1: Exploitant/beheerder label + select */}
              <div className="flex items-center">
                <div className="w-1/3 p-3">
                  <label className="block text-sm font-bold text-gray-700">
                    Exploitant/beheerder:
                  </label>
                </div>
                <div className="w-2/3 px-3">
                  <FormSelect
                    key="i-exploitant"
                    label=""
                    className="w-full border border-gray-300"
                    placeholder="Selecteer exploitant"
                    onChange={(e: any) => {
                      setNewExploitantID(e.target.value);
                    }}
                    value={selectedExploitantID}
                    options={exploitantOptions}
                    disabled={!canEditAllFields}
                  />
                </div>
            </div>
            {/* Row 2: Naam beheerder label + input */}
            {showBeheerderInput && (
                <div className="flex items-center">
                  <div className="w-1/3 p-3">
                    <label className="block text-sm font-bold text-gray-700 whitespace-nowrap">
                      Naam beheerder:
                    </label>
                  </div>
                  <div className="w-2/3 px-3">
                    <FormInput
                      key="i-beheerder"
                      label=""
                      className="w-full border border-gray-300"
                      placeholder="Naam beheerder"
                      onChange={(e: any) => {
                        setNewBeheerder(e.target.value);
                      }}
                      value={
                        newBeheerder !== undefined
                          ? newBeheerder
                          : parkingdata.Beheerder || ""
                      }
                      disabled={!canEditAllFields}
                    />
                  </div>
                </div>
            )}
            {/* Row 3: Contact beheerder label + input */}
            {showBeheerderInput && (
                <div className="flex items-center">
                  <div className="w-1/3 px-3">
                    <label className="block text-sm font-bold text-gray-700 whitespace-nowrap">
                      Contact beheerder:
                    </label>
                  </div>
                  <div className="w-2/3 px-3">
                    <FormInput
                      key="i-beheerdercontact"
                      label=""
                      className="w-full border border-gray-300"
                      placeholder="Email adres of website"
                      onChange={(e: any) => {
                        setNewBeheerderContact(e.target.value);
                      }}
                      value={
                        newBeheerderContact !== undefined
                          ? newBeheerderContact
                          : parkingdata.BeheerderContact
                      }
                      disabled={!canEditAllFields}
                    />
                  </div>
                </div>
            )}

            {/* Preview box */}
            <div className="mt-6 mb-4">
              <div className="border border-gray-300 rounded-md p-4 bg-gray-50">
                <label className="block text-sm font-bold text-gray-700 mb-3">
                  Weergave op de website
                </label>
                { getSectionBlockBeheerder(currentBeheerderName, currentBeheerderContact) }
              </div>
            </div>
          </div>
        </SectionBlockEdit>
      </div>
    </div>
  );
};

export default ParkingEditBeheerder;
