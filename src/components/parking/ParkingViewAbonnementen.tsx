import React, { Fragment } from "react";

import HorizontalDivider from "~/components/HorizontalDivider";
import { Button } from "~/components/Button";
import SectionBlock from "~/components/SectionBlock";
import { type ParkingDetailsType } from "~/types/parking";
import { useSubscriptionTypesForParking } from "~/hooks/useSubscriptionTypesForParking";
import { LoadingSpinner } from "../beheer/common/LoadingSpinner";
import { useAbonnementLink } from "~/hooks/useAbonnementLink";

const ParkingViewAbonnementen = ({ parkingdata }: { parkingdata: ParkingDetailsType }) => {

  const { subscriptionTypes, isLoading: isLoadingSubscriptionTypes, error: errorSubscriptionTypes } = useSubscriptionTypesForParking(parkingdata?.ID||"");
  const { abonnementLink, isLoading: isLoadingAbonnementLink, error: errorAbonnementLink } = useAbonnementLink(parkingdata?.ID||"");
  
  const filteredSubscriptionTypes = subscriptionTypes.filter(x => x.bikeparkTypeID === (parkingdata?.Type || ""));

  console.log("abonnementLink", abonnementLink);

  if(isLoadingSubscriptionTypes || isLoadingAbonnementLink) {
    return <SectionBlock heading="Abonnementen">
      <div className="ml-2 grid grid-cols-3">
        <LoadingSpinner message="" />
      </div>
    </SectionBlock>;
  }

  if(!abonnementLink || !abonnementLink.status || !filteredSubscriptionTypes || filteredSubscriptionTypes.length === 0) {
    return null;
  }

  return (
    <>
      <SectionBlock heading="Abonnementen">
          {((abonnementLink && abonnementLink.status && filteredSubscriptionTypes && filteredSubscriptionTypes.length > 0)) ?
          <div className="ml-2 grid grid-cols-3">
            {filteredSubscriptionTypes.map((x) => {
              // console.log('abonnement', JSON.stringify(x, null, 2));
              return <Fragment key={x.naam}>
                <div className="col-span-2">{x.naam}</div>
                <div className="text-right sm:text-center">&euro;{x.prijs?.toLocaleString('nl-NL') || "---"}</div>
              </Fragment>
            })}
            <div className="text-right sm:text-center">
              <Button className="mt-4" onClick={() => {
                window.open(abonnementLink.url, '_blank');
              }}>
                Koop abonnement
              </Button>
            </div >
            :
            <div className="text-start col-span-3 mt-4">
              Geen abonnementen beschikbaar
            </div>
        </div>: <div className="text-start col-span-3 mt-4">
              Geen abonnementen beschikbaar
            </div>}
      </SectionBlock >

      <HorizontalDivider className="my-4" />
    </>
  );
};

export default ParkingViewAbonnementen;
