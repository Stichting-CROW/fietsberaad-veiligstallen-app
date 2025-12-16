import React from "react";
import SectionBlockEdit from "~/components/SectionBlockEdit";
import FormSelect from "~/components/Form/FormSelect";
import FormInput from "~/components/Form/FormInput";
import { useExploitanten } from "~/hooks/useExploitanten";
import { FiAlertTriangle } from "react-icons/fi";
import SectionBlock from "~/components/SectionBlock";
import { type ParkingDetailsType } from "~/types/parking";
import { getBeheerderContactNew, formatBeheerderContactLink } from "~/utils/parkings-beheerder";

/* 
  ExploitantID NULL / "" -> eigen organisatie, anders exploitant
  HelpdeskHandmatigIngesteld NULL / "" -> false, anders true

  eigen organisatie:
     Beheerder = CompanyName
     BeheerderContact = Helpdesk gemeente
  exploitant:
     Beheerder = CompanyName
     BeheerderContact = Helpdesk exploitant
  handmatig ingesteld:
     Beheerder = Beheerder
     BeheerderContact = BeheerderContact
*/


export const getHelpdeskElement = (parking: ParkingDetailsType) => {
  let contactname: string = "";
  let emailorurl: string = "";
  if(parking.HelpdeskHandmatigIngesteld) {
    contactname = parking.Beheerder || '';
    emailorurl = parking.BeheerderContact || '';
  } else {
    if(parking.ExploitantID !== null && parking.ExploitantID !== "") {
      contactname = parking.contacts_fietsenstallingen_ExploitantIDTocontacts?.CompanyName || '';
      emailorurl = parking.contacts_fietsenstallingen_ExploitantIDTocontacts?.Helpdesk || '';
    } else {
      contactname = parking.contacts_fietsenstallingen_SiteIDTocontacts?.CompanyName || '';
      emailorurl = parking.contacts_fietsenstallingen_SiteIDTocontacts?.Helpdesk || '';
    }
  }

  let contactlink = "";
  if (emailorurl.includes("@")) {
    contactlink = 'mailto:' + emailorurl
  } else if (emailorurl.startsWith("http")) {
    contactlink = emailorurl;
  } else if (emailorurl.startsWith("www")) {
    contactlink = 'https://' + emailorurl;
  } else {
    contactlink = '';
  }

  if(contactlink === "https://www.nsfiets.nl") {
    contactlink = "https://www.ns.nl/fietsenstallingen/";
  }

  if(contactlink !== "") {
    return (
        <a 
          href={contactlink}
          style={{
            textDecoration: 'underline',
            color: '#2563eb',
            cursor: 'pointer'
          }}
          className="hover:text-blue-700 hover:underline"
          title={contactlink}
        >
          {contactname || contactlink}
        </a>
      )
    } else if (contactname !== "") {
      return (
          {contactname}
      )
    } else {
      return null
    }
}
interface ParkingEditBeheerderProps {
  visible?: boolean;
  newExploitantID: string | null | undefined;
  setNewExploitantID: (id: string | null) => void;
  parkingdata: any;
  canEditAllFields: boolean;
  newBeheerder: string | undefined;
  setNewBeheerder: (val: string) => void;
  newBeheerderContact: string | undefined;
  setNewBeheerderContact: (val: string) => void;
  newHelpdeskHandmatigIngesteld: boolean | undefined;
  setNewHelpdeskHandmatigIngesteld: (val: boolean) => void;
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
  newHelpdeskHandmatigIngesteld,
  setNewHelpdeskHandmatigIngesteld,
}) => {
  // Use the hook for exploitanten
  const { exploitanten, isLoading: isLoadingExploitanten, error: errorExploitanten } = useExploitanten(parkingdata.SiteID || undefined);

  if (isLoadingExploitanten) {
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

  if (errorExploitanten) {
    return (
      <div className="flex justify-between" style={{ display: visible ? "flex" : "none" }}>
        <div data-name="content-left" className="sm:mr-12">
          <SectionBlockEdit>
            <div className="mt-4 w-full">
              <div className="text-center py-8">
                <p className="text-red-600">Fout bij het laden: {errorExploitanten}</p>
              </div>
            </div>
          </SectionBlockEdit>
        </div>
      </div>
    );
  }

  // Determine selected exploitantID: null = dataowner (gemeente), not null = exploitant
  // Current value is either the dataowner (when ExploitantID is null) or an exploitant
  const selectedExploitantID =
    newExploitantID !== undefined
      ? newExploitantID
      : parkingdata.ExploitantID; // null means dataowner, otherwise it's an exploitant ID

  // Build exploitant options: dataowner (gemeente via SiteID) first, then available exploitants
  // Only show dataowner and exploitants that are available for this SiteID
  const exploitantOptions: { label: string; value: string | null }[] = [
    { label: parkingdata.contacts_fietsenstallingen_SiteIDTocontacts?.CompanyName || `Eigen organisatie`, value: null }, // Dataowner option
  ];

  // Add available exploitants (already filtered by useExploitanten hook based on SiteID)
  exploitanten.forEach((exp) => {
    exploitantOptions.push({
      label: exp.CompanyName || "Onbekende exploitant",
      value: exp.ID,
    });
  });

  // Determine HelpdeskHandmatigIngesteld value
  const helpdeskHandmatigIngesteld = newHelpdeskHandmatigIngesteld !== undefined
    ? newHelpdeskHandmatigIngesteld
    : (parkingdata.HelpdeskHandmatigIngesteld === true || parkingdata.HelpdeskHandmatigIngesteld === 1);

  // Show beheerder inputs when HelpdeskHandmatigIngesteld is true
  const showBeheerderInput = helpdeskHandmatigIngesteld;

  let currentBeheerderName = "";
  let currentBeheerderContact = "";

  // derive current beheerder name and contact based on HelpdeskHandmatigIngesteld
  if (helpdeskHandmatigIngesteld) {
    // Manual mode: use beheerder/beheerdercontact fields
    currentBeheerderName = newBeheerder !== undefined
      ? newBeheerder
      : parkingdata.Beheerder || "";
    currentBeheerderContact = newBeheerderContact !== undefined
      ? newBeheerderContact
      : parkingdata.BeheerderContact || "";
  } else {
    // Standard mode: derive from exploitantID
    if (selectedExploitantID === null || selectedExploitantID === parkingdata.SiteID) {
      // Gemeente (null exploitantID)
      currentBeheerderName = parkingdata.contacts_fietsenstallingen_SiteIDTocontacts?.CompanyName || `Gemeente ${parkingdata.SiteID}`;
      currentBeheerderContact = parkingdata.contacts_fietsenstallingen_SiteIDTocontacts?.Helpdesk ? parkingdata.contacts_fietsenstallingen_SiteIDTocontacts.Helpdesk : '';
    } else {
      // Exploitant
      const currentExploitant = exploitanten.find(exp => exp.ID === selectedExploitantID);
      currentBeheerderName = currentExploitant?.CompanyName || "";
      currentBeheerderContact = currentExploitant?.Helpdesk ? currentExploitant.Helpdesk : '';
    }
  }


  return (
    <div className="flex justify-between" style={{ display: visible ? "flex" : "none" }}>
      <div data-name="content-left" className="sm:mr-12">
        <SectionBlockEdit>
          <div className="mt-4 w-full">
            {/* Row 1: Exploitant/beheerder label + select */}
              <div className="grid grid-cols-3 gap-4 items-center">
                <div className="p-3 overflow-hidden">
                  <label className="block text-sm font-bold text-gray-700 whitespace-nowrap">
                    Exploitant/beheerder:
                  </label>
                </div>
                <div className="col-span-2 px-3 min-w-0 overflow-hidden">
                  <FormSelect
                    key="i-exploitant"
                    label=""
                    className="w-full border border-gray-300 max-w-full"
                    onChange={(e: any) => {
                      const value = e.target.value;
                      // Convert empty string to null for gemeente, otherwise use the value
                      const newValue = value === "" ? null : value;
                      setNewExploitantID(newValue);
                    }}
                    value={selectedExploitantID === null ? "" : selectedExploitantID}
                    options={exploitantOptions.map(opt => ({ label: opt.label, value: opt.value === null ? "" : opt.value }))}
                    disabled={!canEditAllFields}
                  />
                </div>
            </div>
            {!helpdeskHandmatigIngesteld && (selectedExploitantID === null || selectedExploitantID === parkingdata.SiteID) && !currentBeheerderContact && (
              <div className="px-3 mt-2">
                <div className="flex items-center gap-1 text-amber-600" title="Let op, er is geen helpdesk email adres ingesteld voor deze organisatie">
                  <FiAlertTriangle className="w-5 h-5 flex-shrink-0" />
                  <span className="text-sm">
                    Let op, er is geen helpdesk email adres ingesteld voor deze organisatie
                  </span>
                </div>
              </div>
            )}
            {/* Helpdesk control with radio buttons */}
            <div className="grid grid-cols-3 gap-4 items-center mt-4">
              <div className="p-3 overflow-hidden">
                <label className="block text-sm font-bold text-gray-700 whitespace-nowrap">
                  Helpdesk:
                </label>
              </div>
              <div className="col-span-2 px-3 min-w-0 overflow-hidden">
                <div className="flex gap-6">
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="helpdesk-type"
                      value="standaard"
                      checked={!helpdeskHandmatigIngesteld}
                      onChange={() => setNewHelpdeskHandmatigIngesteld(false)}
                      disabled={!canEditAllFields}
                      className="mr-2"
                    />
                    <span className="text-sm">Standaard helpdesk</span>
                  </label>
                  <label className="flex items-center">
                    <input
                      type="radio"
                      name="helpdesk-type"
                      value="anders"
                      checked={helpdeskHandmatigIngesteld}
                      onChange={() => setNewHelpdeskHandmatigIngesteld(true)}
                      disabled={!canEditAllFields}
                      className="mr-2"
                    />
                    <span className="text-sm">Anders</span>
                  </label>
                </div>
              </div>
            </div>
            {/* Row 2: Naam beheerder label + input */}
            {/* Always visible: disabled with standard values when "Standaard helpdesk", enabled when "Anders" */}
            <div className="flex items-center mt-4">
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
                    helpdeskHandmatigIngesteld
                      ? (newBeheerder !== undefined
                          ? newBeheerder
                          : parkingdata.Beheerder || "")
                      : currentBeheerderName
                  }
                  disabled={!canEditAllFields || !helpdeskHandmatigIngesteld}
                />
              </div>
            </div>
            {/* Row 3: Contact beheerder label + input */}
            {/* Always visible: disabled with standard values when "Standaard helpdesk", enabled when "Anders" */}
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
                    helpdeskHandmatigIngesteld
                      ? (newBeheerderContact !== undefined
                          ? newBeheerderContact
                          : parkingdata.BeheerderContact || "")
                      : currentBeheerderContact
                  }
                  disabled={!canEditAllFields || !helpdeskHandmatigIngesteld}
                />
              </div>
            </div>

            {/* Preview box */}
            <div className="mt-6 mb-4">
              <div className="border border-gray-300 rounded-md p-4 bg-gray-50">
                <label className="block text-sm font-bold text-gray-700 mb-3">
                  Weergave op de website
                </label>
                {(() => {
                  // Create a preview parking object with current form values
                  // Update contacts relationships based on selectedExploitantID
                  const selectedExploitant = selectedExploitantID && selectedExploitantID !== parkingdata.SiteID
                    ? exploitanten.find(exp => exp.ID === selectedExploitantID)
                    : undefined;
                  
                  const previewParking: ParkingDetailsType = {
                    ...parkingdata,
                    ExploitantID: selectedExploitantID,
                    Beheerder: helpdeskHandmatigIngesteld 
                      ? (newBeheerder !== undefined ? newBeheerder : parkingdata.Beheerder)
                      : undefined, // Will be derived from contacts in getBeheerderContactNew
                    BeheerderContact: helpdeskHandmatigIngesteld
                      ? (newBeheerderContact !== undefined ? newBeheerderContact : parkingdata.BeheerderContact)
                      : undefined, // Will be derived from contacts in getBeheerderContactNew
                    HelpdeskHandmatigIngesteld: helpdeskHandmatigIngesteld,
                    contacts_fietsenstallingen_ExploitantIDTocontacts: selectedExploitant
                      ? {
                          ID: selectedExploitant.ID,
                          CompanyName: selectedExploitant.CompanyName || "",
                          Helpdesk: selectedExploitant.Helpdesk || "",
                        }
                      : undefined,
                  };
                  
                  const beheerderInfo = getBeheerderContactNew(
                    previewParking.ExploitantID,
                    previewParking.Beheerder,
                    previewParking.BeheerderContact,
                    previewParking.HelpdeskHandmatigIngesteld,
                    previewParking.contacts_fietsenstallingen_ExploitantIDTocontacts?.CompanyName,
                    previewParking.contacts_fietsenstallingen_ExploitantIDTocontacts?.Helpdesk,
                    previewParking.contacts_fietsenstallingen_SiteIDTocontacts?.CompanyName,
                    previewParking.contacts_fietsenstallingen_SiteIDTocontacts?.Helpdesk
                  );
                  if (!beheerderInfo.visible) {
                    return (
                      <SectionBlock heading="Beheerder">
                        <span className="text-gray-500 italic">Verborgen</span>
                      </SectionBlock>
                    );
                  }
                  
                  const contactLink = formatBeheerderContactLink(beheerderInfo.beheerdercontact);
                  const displayName = beheerderInfo.beheerder || contactLink.displayText || "";
                  
                  return (
                    <SectionBlock heading="Beheerder">
                      {contactLink.href ? (
                        <a 
                          href={contactLink.href}
                          style={{
                            textDecoration: 'underline',
                            color: '#2563eb',
                            cursor: 'pointer'
                          }}
                          className="hover:text-blue-700 hover:underline"
                          title={contactLink.href}
                        >
                          {displayName}
                        </a>
                      ) : displayName ? (
                        <span>{displayName}</span>
                      ) : null}
                    </SectionBlock>
                  );
                })()}
              </div>
            </div>
          </div>
        </SectionBlockEdit>
      </div>
    </div>
  );
};

export default ParkingEditBeheerder;
