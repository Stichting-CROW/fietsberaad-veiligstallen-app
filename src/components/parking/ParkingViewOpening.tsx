import React from "react";
import { formatOpeningTimes } from "~/utils/parkings-openclose";
import moment from "moment";

import SectionBlock from "~/components/SectionBlock";
import HorizontalDivider from "~/components/HorizontalDivider";

const ParkingViewOpening = ({ parkingdata }: { parkingdata: any }) => {

  // Convert 'openingstijden extra text' to HTML format
  if (parkingdata.Openingstijden !== null && parkingdata.Openingstijden.indexOf("\n") > -1) {
    parkingdata.Openingstijden = parkingdata.Openingstijden.replace("\n", "<br />");
  }

  const isNS = parkingdata.EditorCreated === "NS-connector";
  const wkday = moment().day();

  return (
    <>
      <SectionBlock
        heading="Openingstijden"
        contentClasses="grid grid-cols-2"
      >
        {formatOpeningTimes(parkingdata, "ma", "Maandag", wkday === 1, isNS)}
        {formatOpeningTimes(parkingdata, "di", "Dinsdag", wkday === 2, isNS)}
        {formatOpeningTimes(parkingdata, "wo", "Woensdag", wkday === 3, isNS)}
        {formatOpeningTimes(parkingdata, "do", "Donderdag", wkday === 4, isNS)}
        {formatOpeningTimes(parkingdata, "vr", "Vrijdag", wkday === 5, isNS)}
        {formatOpeningTimes(parkingdata, "za", "Zaterdag", wkday === 6, isNS)}
        {formatOpeningTimes(parkingdata, "zo", "Zondag", wkday === 0, isNS)}
        {parkingdata.Openingstijden !== "" && (
          <div className="col-span-2">
            <div>
              <br />
              <div dangerouslySetInnerHTML={{ __html: parkingdata.Openingstijden }} />
            </div>
          </div>
        )}
      </SectionBlock>
      <HorizontalDivider className="my-4" />
    </>
  );
};

export default ParkingViewOpening;
