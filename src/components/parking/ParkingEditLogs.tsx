import React from "react";
import SectionBlockEdit from "~/components/SectionBlockEdit";
import FormSelect from "~/components/Form/FormSelect";
import FormInput from "~/components/Form/FormInput";
import { useExploitanten } from "~/hooks/useExploitanten";
import { FiAlertTriangle } from "react-icons/fi";
import SectionBlock from "~/components/SectionBlock";
import { type ParkingDetailsType } from "~/types/parking";
import { getBeheerderContactNew, formatBeheerderContactLink } from "~/utils/parkings-beheerder";

interface ParkingEditLogsProps {
  visible?: boolean;
  parkingdata: ParkingDetailsType;
}

const ParkingEditLogs: React.FC<ParkingEditLogsProps> = ({
  visible = false,
  parkingdata,
}) => {
  return (
    <div className="flex justify-between" style={{ display: visible ? "flex" : "none" }}>
      <div className="mt-4 w-full">
        <dl>
          <dt className="font-bold">Laatst bewerkt</dt>
          <dd>{parkingdata.DateModified ? new Date(parkingdata.DateModified).toLocaleDateString() : "N/A"} door {parkingdata.EditorModified || "[onbekend]"}</dd>
        </dl>
        <dl>
          <dt className="font-bold mt-4">Aangemaakt</dt>
          <dd>{parkingdata.DateCreated ? new Date(parkingdata.DateCreated).toLocaleDateString() : "N/A"} door {parkingdata.EditorCreated || "[onbekend]"}</dd>
        </dl>
      </div>
    </div>
  );
};

export default ParkingEditLogs;
