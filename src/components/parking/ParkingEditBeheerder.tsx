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

  const showBeheerderInput = selectedExploitantID !== "anders";

  return (
    <div className="flex justify-between" style={{ display: visible ? "flex" : "none" }}>
      <div data-name="content-left" className="sm:mr-12">
        <SectionBlockEdit>
          <div className="mt-4 w-full">
            {/* Row 1: Exploitant/beheerder label + select */}
            <div className="mb-4">
              <div className="flex items-center">
                <div className="w-1/3 p-3">
                  <label className="block text-sm font-bold text-gray-700">
                    Exploitant/beheerder:
                  </label>
                </div>
                <div className="w-2/3 p-3">
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
            </div>
            {/* Row 2: No label + (Namelijk + input) */}
            {showBeheerderInput && (
              <div className="mb-4">
                <div className="flex items-center">
                  <div className="w-1/3 p-3">{/* Empty label space */}</div>
                  <div className="w-2/3 p-3">
                    <div className="flex items-center gap-2">
                      <label className="text-sm font-medium text-gray-600 whitespace-nowrap">
                        Namelijk:
                      </label>
                      <input
                        type="text"
                        className={`flex-1 px-3 py-2 border border-gray-300 rounded-md ${!canEditAllFields ? "bg-gray-100 opacity-50 cursor-not-allowed" : "bg-white"}`}
                        value={
                          newBeheerder !== undefined &&
                          newBeheerder !== null &&
                          newBeheerder !== ""
                            ? newBeheerder
                            : parkingdata.Beheerder || ""
                        }
                        onChange={(e) => {
                          setNewBeheerder(e.target.value);
                        }}
                        placeholder="Website en contactgegevens"
                        disabled={!canEditAllFields}
                      />
                    </div>
                  </div>
                </div>
              </div>
            )}
            {/* Row 3: Contact beheerder label + input */}
            <div className="mb-4">
              <div className="flex items-center">
                <div className="w-1/3 p-3">
                  <label className="block text-sm font-bold text-gray-700 whitespace-nowrap">
                    Contact beheerder:
                  </label>
                </div>
                <div className="w-2/3 p-3">
                  <FormInput
                    key="i-beheerdercontact"
                    label=""
                    className="w-full border border-gray-300"
                    placeholder="Email adres"
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
            </div>
          </div>
        </SectionBlockEdit>
      </div>
    </div>
  );
};

export default ParkingEditBeheerder;
