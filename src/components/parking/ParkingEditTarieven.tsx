import React, { useState } from "react";
import SectionBlock from "~/components/SectionBlock";
import SectionBlockEdit from "~/components/SectionBlockEdit";
import Modal from "~/components/Modal";
import FormSelect from "~/components/Form/FormSelect";
import { FormHelperText } from "@mui/material";
import HorizontalDivider from "~/components/HorizontalDivider";
import RichTextEditor from "~/components/common/RichTextEditor";
import type { ParkingDetailsType } from "~/types/parking";
import ParkingEditTariefregels from "~/components/parking/ParkingEditTariefregels";

type ParkingEditTarievenProps = {
  parkingdata: ParkingDetailsType;
  newTariefcode: number | null | undefined;
  setNewTariefcode: React.Dispatch<
    React.SetStateAction<number | null | undefined>
  >;
  newOmschrijvingTarieven: string | undefined;
  setNewOmschrijvingTarieven: React.Dispatch<
    React.SetStateAction<string | undefined>
  >;

  canEdit: boolean;
};

const ParkingEditTarieven = ({
  parkingdata,
  newTariefcode,
  setNewTariefcode,
  newOmschrijvingTarieven,
  setNewOmschrijvingTarieven,
  canEdit,
}: ParkingEditTarievenProps) => {
  // const { tariefcodes, isLoading: isLoadingTariefcodes } = useTariefcodes();
  const [tarievenVersion, setTarievenVersion] = useState<string | null>(null);
  const [editMode, setEditMode] = useState(false);

  const currentTariefcode =
    newTariefcode !== undefined
      ? newTariefcode
      : parkingdata.Tariefcode !== null && parkingdata.Tariefcode !== undefined
        ? parkingdata.Tariefcode
        : null;

  const tariefcodeOptions: { value: string; label: string }[] = [
    { value: "null", label: "niet tonen" },
  ];

  const dropdownValue =
    currentTariefcode === null ||
    currentTariefcode === undefined ||
    currentTariefcode === 0
      ? "null"
      : currentTariefcode.toString();

  return (
    <div className="flex w-full flex-col">
      <SectionBlockEdit>
        <div className="mt-4">
          <FormSelect
            key="i-tariefcode"
            label="Tarief (Compacte weergave)"
            className="mb-1 border-2 border-black"
            style={{ width: "auto", minWidth: "200px" }}
            value={dropdownValue}
            onChange={e => {
              const value = e.target.value;
              if (value === "null") {
                setNewTariefcode(null);
              } else {
                setNewTariefcode(parseInt(value, 10));
              }
            }}
            disabled={!canEdit}
            options={tariefcodeOptions}
          />
          <FormHelperText>
            Deze tekst wordt getoond in de compacte weergaven van stallingen.
          </FormHelperText>
        </div>
      </SectionBlockEdit>
      <HorizontalDivider className="my-4" />
      <SectionBlock  heading="Tarieven detail">
        <div>
        <ParkingEditTariefregels 
          editmode={false} 
          showEdit={canEdit} 
          onEdit={()=>setEditMode(true)} 
          parkingID={parkingdata.ID} 
          onClose={(version: string)=>{ setEditMode(false); setTarievenVersion(version); }} version={tarievenVersion} /></div>
      </SectionBlock>
      <HorizontalDivider className="my-4" />
      <SectionBlock heading="Omschrijving Tarieven" contentClasses="w-full">
        <RichTextEditor
          value={
            newOmschrijvingTarieven === undefined
              ? parkingdata.OmschrijvingTarieven || ""
              : newOmschrijvingTarieven
          }
          onChange={(value: string) => {
            if (value === parkingdata.OmschrijvingTarieven) {
              setNewOmschrijvingTarieven(undefined);
            } else {
              setNewOmschrijvingTarieven(value);
            }
          }}
          className="w-full"
        />
      </SectionBlock>

      {/* Edit section dialog */}
      {editMode && (
        <Modal onClose={()=>{setEditMode(false); setTarievenVersion(null);}} clickOutsideClosesDialog={false}>
          <div className="space-y-4">
            <SectionBlockEdit>
              <ParkingEditTariefregels 
                editmode={true} 
                showEdit={false}
                onEdit={()=>{}}
                parkingID={parkingdata.ID} 
                onClose={(datahash: string)=>{ setEditMode(false); setTarievenVersion(datahash); }} 
                version={tarievenVersion} />
            </SectionBlockEdit>
          </div>
        </Modal>)}
    </div>
  );
};

export default ParkingEditTarieven;

