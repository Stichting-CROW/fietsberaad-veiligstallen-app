import React, { Fragment } from "react";
import { useRouter } from "next/router";

import HorizontalDivider from "~/components/HorizontalDivider";
import { Button } from "~/components/Button";
import SectionBlock from "~/components/SectionBlock";
import { type ParkingDetailsType } from "~/types/parking";
import { useSubscriptionTypesForParking } from "~/hooks/useSubscriptionTypesForParking";
import { LoadingSpinner } from "../beheer/common/LoadingSpinner";
import { useAbonnementLink } from "~/hooks/useAbonnementLink";

const renderGeenInfoBeschikbaar = () => {
  return (
    <>  
      <SectionBlock heading="Abonnementen">
        <div className="ml-2 grid grid-cols-1">
          <div>Geen informatie over abonnementen beschikbaar</div>
        </div>
      </SectionBlock>
      <HorizontalDivider className="my-4" />
    </>
  );
};

function opensNewAccountCheckout(): boolean {
  if (process.env.NODE_ENV === "development") return true;
  if (process.env.NEXT_PUBLIC_APP_ENV === "acceptance") return true;
  if (typeof window !== "undefined" && window.location.hostname.includes("vstfb-eu-acc")) return true;
  return false;
}

const ParkingViewAbonnementen = ({ parkingdata }: { parkingdata: ParkingDetailsType }) => {
  const router = useRouter();
  const accountCheckout = opensNewAccountCheckout();

  const { subscriptionTypes, isLoading: isLoadingSubscriptionTypes, error: errorSubscriptionTypes } = useSubscriptionTypesForParking(parkingdata?.ID||"");
  const { abonnementLink, isLoading: isLoadingAbonnementLink, error: errorAbonnementLink } = useAbonnementLink(parkingdata?.ID||"");
  
  const filteredSubscriptionTypes = subscriptionTypes.filter(x => x.bikeparkTypeID === (parkingdata?.Type || ""));

  if(isLoadingSubscriptionTypes || isLoadingAbonnementLink) {
    return <SectionBlock heading="Abonnementen">
      <div className="ml-2 grid grid-cols-3">
        <LoadingSpinner message="" />
      </div>
    </SectionBlock>;
  }

  if(!abonnementLink || !abonnementLink.status || !filteredSubscriptionTypes ) {
    return renderGeenInfoBeschikbaar();
  }

  if(filteredSubscriptionTypes.length === 0) {
    return renderGeenInfoBeschikbaar();
  }

  return (
    <>
      <SectionBlock heading="Abonnementen">
        <div className="ml-2 grid grid-cols-3">
          {filteredSubscriptionTypes.map((x) => {
            // console.log('abonnement', JSON.stringify(x, null, 2));
            return <Fragment key={x.naam}>
              <div className="col-span-2">{x.naam}</div>
              <div className="text-right sm:text-center">&euro;{x.prijs?.toLocaleString('nl-NL') || "---"}</div>
            </Fragment>
          })}
        </div>
        <div className="text-right sm:text-center">
          <Button className="mt-4" onClick={() => {
            const type = parkingdata.Type ?? "";
            if (accountCheckout && parkingdata.SiteID) {
              const buurt = type === "buurtstalling" || type === "fietstrommel";
              const params = new URLSearchParams({
                siteId: parkingdata.SiteID,
                parkingId: parkingdata.ID,
              });
              if (buurt) params.set("wizard", "fiets");
              else if (type) params.set("type", type);
              void router.push(`/account/abonnement?${params.toString()}`);
              return;
            }
            window.open(abonnementLink.url, "_blank");
          }}>
            Koop abonnement
          </Button>
        </div >
    
      </SectionBlock > 
      <HorizontalDivider className="my-4" />
    </>
  );
};

export default ParkingViewAbonnementen;
