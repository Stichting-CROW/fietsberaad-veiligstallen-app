import React from "react";
import SectionBlockEdit from "~/components/SectionBlockEdit";
import FormSelect from "~/components/Form/FormSelect";
import FormInput from "~/components/Form/FormInput";

interface ParkingEditBeheerderProps {
  visible?: boolean;
  isLoadingExploitanten: boolean;
  exploitanten: any[];
  errorExploitanten: string | null;
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
  isLoadingExploitanten,
  exploitanten,
  errorExploitanten,
  newExploitantID,
  setNewExploitantID,
  parkingdata,
  canEditAllFields,
  newBeheerder,
  setNewBeheerder,
  newBeheerderContact,
  setNewBeheerderContact,
}) => {
  if (isLoadingExploitanten) {
    return (
      <div className="flex justify-between" style={{ display: visible ? "flex" : "none" }}>
        <div data-name="content-left" className="sm:mr-12">
          <SectionBlockEdit>
            <div className="mt-4 w-full">
              <div className="text-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 mx-auto"></div>
                <p className="mt-2 text-gray-600">Exploitanten laden...</p>
              </div>
            </div>
          </SectionBlockEdit>
        </div>
      </div>
    );
  }

  if (errorExploitanten) {
    return (
      <div className="flex justify-between" style={{ display: visible ? "flex" : "none" }}>
        <div data-name="content-left" className="sm:mr-12">
          <SectionBlockEdit>
            <div className="mt-4 w-full">
              <div className="text-center py-8">
                <p className="text-red-600">Fout bij het laden van exploitanten: {errorExploitanten}</p>
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
  exploitanten.forEach((exp) => {
    exploitantOptions.push({
      label: exp.CompanyName || "Onbekende exploitant",
      value: exp.ID,
    });
  });

  const showBeheerderInput = selectedExploitantID === "anders";

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
                <div className="text-sm text-gray-600">
                  {(() => {
                    // Get current values (new values if set, otherwise existing values)
                    // Use newExploitantID if it's been set (even if "anders"), otherwise use original
                    const currentExploitantID = newExploitantID !== undefined 
                      ? newExploitantID 
                      : (parkingdata.ExploitantID === null ? "anders" : parkingdata.ExploitantID);
                    
                    // Use newBeheerder if it's been set (even if empty string), otherwise use original
                    const currentBeheerder = newBeheerder !== undefined
                      ? newBeheerder
                      : parkingdata.Beheerder;
                    
                    // Use newBeheerderContact if it's been set (even if empty string), otherwise use original
                    const currentBeheerderContact = newBeheerderContact !== undefined
                      ? newBeheerderContact
                      : parkingdata.BeheerderContact;

                    // Find selected exploitant
                    const selectedExploitant = currentExploitantID && currentExploitantID !== "anders"
                      ? exploitanten.find(exp => exp.ID === currentExploitantID)
                      : null;

                    // Display logic matches ParkingViewBeheerder
                    if (selectedExploitant) {
                      const mailtoLink = 'mailto:' + (selectedExploitant.Helpdesk || '');
                      return (
                        <div>
                          <span className="font-semibold">Beheerder:</span>{" "}
                          <a 
                            href={mailtoLink}
                            className="text-blue-600 underline hover:text-blue-700"
                            title={mailtoLink}
                          >
                            {selectedExploitant.CompanyName}
                          </a>
                        </div>
                      );
                    } else if (currentBeheerderContact !== null && currentBeheerderContact !== undefined && currentBeheerderContact !== "") {
                      let contactlink = "";
                      if (currentBeheerderContact.includes("@")) {
                        contactlink = 'mailto:' + currentBeheerderContact;
                      } else if (currentBeheerderContact.startsWith("http")) {
                        contactlink = currentBeheerderContact;
                      } else if (currentBeheerderContact.startsWith("www")) {
                        contactlink = 'https://' + currentBeheerderContact;
                      }

                      if(contactlink === "https://www.nsfiets.nl") {
                        contactlink = "https://www.ns.nl/fietsenstallingen/";
                      }

                      const displayText = currentBeheerder === null || currentBeheerder === "" 
                        ? currentBeheerderContact 
                        : currentBeheerder;

                      return (
                        <div>
                          <span className="font-semibold">Beheerder:</span>{" "}
                          {contactlink ? (
                            <a 
                              href={contactlink}
                              className="text-blue-600 underline hover:text-blue-700"
                              target="_blank"
                              rel="noopener noreferrer"
                              title={contactlink}
                            >
                              {displayText}
                            </a>
                          ) : (
                            <span>{displayText}</span>
                          )}
                        </div>
                      );
                    } else {
                      return (
                        <div className="text-gray-500 italic">
                          Geen beheerder informatie beschikbaar. Dit veld wordt niet getoond op de website.
                        </div>
                      );
                    }
                  })()}
                </div>
              </div>
            </div>
          </div>
        </SectionBlockEdit>
      </div>
    </div>
  );
};

export default ParkingEditBeheerder;
