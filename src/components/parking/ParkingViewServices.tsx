import React from "react";
import HorizontalDivider from "~/components/HorizontalDivider";
import { type ParkingDetailsType } from "~/types/parking";

import SectionBlock from "~/components/SectionBlock";

import { type VSservice } from "~/types/services";


const ParkingViewServices = ({ parkingdata }: { parkingdata: ParkingDetailsType }) => {
  const [allServices, setAllServices] = React.useState<ServiceType[]>([]);

  // Set 'allServices' variable in local state
  React.useEffect(() => {
    const updateServices = async () => {
      const response = await fetch(`/api/protected/services`);
      const json = await response.json() as VSservice[];
      if (!json) return [];

      setAllServices(json);
    }

    updateServices().catch(err => {
      console.error("get all services error", err);
    });
  }, []);

  const serviceIsActive = (ID: string): boolean => {
    for (const x of parkingdata.fietsenstallingen_services) {
      if (x.services.ID === ID) {
        return true;
      }
    }

    return false;
  }

  if (parkingdata.fietsenstallingen_services === null || parkingdata.fietsenstallingen_services === undefined) {
    return null
  }

  const activeServices = allServices && allServices.filter((service: any) => serviceIsActive(service.ID)) || [];
  if (activeServices.length === 0) {
    // dont show services header if there are none
    return null;
  }


  return <>
    <SectionBlock heading="Services">
      <div className="flex-1" key={'services' + parkingdata.ID}>
        {allServices && allServices.map(service => {
          if (!serviceIsActive(service.ID)) return null;
          return (
            <div key={service.ID}>
              {service.Name}
            </div>
          );
        })}
      </div>
      {parkingdata.ExtraServices && <>
        {parkingdata.ExtraServices.split(',').map(x => {
          return <div key={x}>
            {x.trim()}
          </div>
        })}
      </>}
    </SectionBlock>
    <HorizontalDivider className="my-4" />
  </>
};

export default ParkingViewServices;
