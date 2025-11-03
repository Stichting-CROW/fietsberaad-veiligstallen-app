import React from "react";
import HorizontalDivider from "~/components/HorizontalDivider";

import SectionBlock from "~/components/SectionBlock";
import { useTariefcodes } from "~/hooks/useTariefcodes";

const ParkingViewTarief = ({ parkingdata }: { parkingdata: any }) => {
  const { getTariefcodeText, isLoading } = useTariefcodes();

  // console.log("### " + parkingdata.Title + " berekent stallingkosten ###", parkingdata.Tariefcode);

  if (parkingdata.Tariefcode === null) {
    return null;
  }

  if (isLoading) {
    return null;
  }

  const tariefcodeText = getTariefcodeText(parkingdata.Tariefcode);

  return (
    <>
      <SectionBlock heading="Tarief">
        {tariefcodeText || ""}
      </SectionBlock>
      <HorizontalDivider className="my-4" />
    </>
  );

  // <>
  //   <div className="font-bold">Fietsen</div>
  //   <div className="ml-2 grid w-full grid-cols-2">
  //     <div>Eerste 24 uur:</div>
  //     <div className="text-right sm:text-center">gratis</div>
  //     <div>Daarna per 24 uur:</div>
  //     <div className="text-right sm:text-center">&euro;0,60</div>
  //   </div>
  //   <div className="mt-4 font-bold">Bromfietsen</div>
  //   <div className="ml-2 grid w-full grid-cols-2">
  //     <div>Eerste 24 uur:</div>
  //     <div className="text-right sm:text-center">&euro;0,60</div>
  //   </div>
  // </>

};

export default ParkingViewTarief;
