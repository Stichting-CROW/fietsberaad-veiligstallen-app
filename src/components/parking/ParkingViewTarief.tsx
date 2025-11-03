import React from "react";
import HorizontalDivider from "~/components/HorizontalDivider";

import SectionBlock from "~/components/SectionBlock";
import { useTariefcodes } from "~/hooks/useTariefcodes";

const ParkingViewTarief = ({ parkingdata }: { parkingdata: any }) => {
  const { getTariefcodeText, isLoading } = useTariefcodes();

  // console.log("### " + parkingdata.Title + " berekent stallingkosten ###", parkingdata.Tariefcode);

  const hasOmschrijvingTarieven = parkingdata.OmschrijvingTarieven && parkingdata.OmschrijvingTarieven.trim() !== "";
  
  // Show section if there's a tariefcode or if there's OmschrijvingTarieven
  if (parkingdata.Tariefcode === null && !hasOmschrijvingTarieven) {
    return null;
  }

  if (isLoading) {
    return null;
  }

  const tariefcodeText = parkingdata.Tariefcode !== null 
    ? getTariefcodeText(parkingdata.Tariefcode)
    : "";

  // Don't show section if there's neither tariefcode text nor OmschrijvingTarieven
  if (!tariefcodeText && !hasOmschrijvingTarieven) {
    return null;
  }

  return (
    <>
      <SectionBlock heading="Tarief">
        {tariefcodeText && <div className="mb-2">{tariefcodeText}</div>}
        {hasOmschrijvingTarieven && (
          <div dangerouslySetInnerHTML={{ __html: parkingdata.OmschrijvingTarieven || "" }} />
        )}
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
