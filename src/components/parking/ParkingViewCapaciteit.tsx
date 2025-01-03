import React from "react";
import HorizontalDivider from "~/components/HorizontalDivider";

import SectionBlock from "~/components/SectionBlock";
import { ParkingDetailsType } from "~/types";

type capacitydata = {
  unknown: boolean;
  total: number;
  detailed: {
    [key: string]: {
      Toegestaan: boolean;
      Capaciteit: number;
    }
  };
};

const calculateCapacityData = (parking: ParkingDetailsType): capacitydata | null => {
  try {
    let capacity: capacitydata = {
      unknown: false,
      total: 0,
      detailed: {},
    };

    if (parking === null) {
      capacity.unknown = true
    } else if (parking.fietsenstalling_secties.length === 0) {
      capacity.unknown = false;
      capacity.total = parking.Capacity || 0;
    } else {
      // Get parking section (new: 1 per parking, to make it easy)
      parking.fietsenstalling_secties.forEach((sectie) => {
        // Get capactity per modality for this parking section
        sectie.secties_fietstype.forEach(data => {
          const name = data.fietstype.Name;
          if (name in capacity.detailed === false) {
            capacity.detailed[name] = {
              Toegestaan: false,
              Capaciteit: 0,
            }
          }

          let detailed = capacity.detailed[name];
          if (detailed !== undefined) {
            detailed.Toegestaan = detailed.Toegestaan || (data.Toegestaan !== null && data.Toegestaan);
            detailed.Capaciteit += data.Capaciteit || 0;
          }
          // capacity.detailed[name].Toegestaan = capacity.detailed[name].Toegestaan || data.Toegestaan !== null && data.Toegestaan;
          // capacity.detailed[name].Capaciteit += data.Capaciteit || 0;
          capacity.total += data.Capaciteit || 0;
        });
      });
    }

    return capacity;
  } catch (e: any) {
    console.error("getCapacityDataForParking - error:", e.message);
    return null;
  }
};

const ParkingViewCapaciteit = ({ parkingdata }: { parkingdata: ParkingDetailsType }) => {
  let content = null;

  const capacitydata = calculateCapacityData(parkingdata);
  // console.log("#### capacitydata", capacitydata, parkingdata);

  if (capacitydata === null || capacitydata?.unknown || (Object.keys(capacitydata.detailed).length === 0 && capacitydata.total === 0)) {
    return null;
  }

  if (capacitydata.detailed === null || Object.keys(capacitydata.detailed).length === 0) {
    content = (
      <>
        <div key={"c-1"} className="">{parkingdata.Capacity}</div>
        <div key={"c-2"} className="text-right"></div>
      </>
    );
  }
  else {
    content = Object.keys(capacitydata.detailed).map(key => {
      const detail = capacitydata.detailed[key];
      if (detail === undefined) {
        return null;
      } else if (detail.Toegestaan === false) {
        return (
          <React.Fragment key={key + "-1"}>
            <div className="">{key}</div>
            <div className="text-right">Niet toegestaan</div>
          </React.Fragment >
        );
      } else if ((detail.Capaciteit || 0) > 0) {
        return (
          <React.Fragment key={key + "-2"}>
            <div className="">{key}</div>
            <div className="text-right">{detail.Capaciteit}</div>
          </React.Fragment>
        );
      } else {
        return null;
      }
    });
  }

  if (content === null) {
    return null;
  }

  return (
    <>
      <SectionBlock heading="Capaciteit">
        <div className="grid grid-cols-2">
          {content}
        </div>
      </SectionBlock>

      <HorizontalDivider className="my-4" />
    </>
  );
};

export default ParkingViewCapaciteit;
