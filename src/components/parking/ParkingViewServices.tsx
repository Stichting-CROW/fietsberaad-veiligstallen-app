import React from "react";
import HorizontalDivider from "~/components/HorizontalDivider";
import { type ParkingDetailsType } from "~/types/parking";

import SectionBlock from "~/components/SectionBlock";

import { type VSservice } from "~/types/services";


const ParkingViewServices = ({ parkingdata }: { parkingdata: ParkingDetailsType }) => {
  const [allServices, setAllServices] = React.useState<VSservice[]>([]);

  // Set 'allServices' variable in local state
  React.useEffect(() => {
    const updateServices = async () => {
      const response = await fetch(`/api/protected/services`);
      const json = await response.json() as VSservice[];
      if (!json) return [];

      // Add ExtraServices to the list
      const servicesList = [...json];
      
      if (parkingdata.ExtraServices && parkingdata.ExtraServices.trim().length > 0) {
        const extraServicesList = parkingdata.ExtraServices
          .split(',')
          .map(x => x.trim())
          .filter(x => x.length > 0);
        
        extraServicesList.forEach((extraService, index) => {
          servicesList.push({
            ID: `extra-${parkingdata.ID}-${index}`,
            Name: extraService,
          } as VSservice);
        });
      }

      setAllServices(servicesList);
    }

    updateServices().catch(err => {
      console.error("get all services error", err);
    });
  }, [parkingdata.ExtraServices, parkingdata.ID]);

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

  // Filter services: regular services that are active, and all extra services
  const displayedServices = allServices && allServices.filter((service: any) => {
    // Show regular services if they're active
    if (!service.ID.startsWith('extra-')) {
      return serviceIsActive(service.ID);
    }
    // Show all extra services
    return true;
  }) || [];
  
  if (displayedServices.length === 0) {
    // dont show services header if there are none
    return null;
  }

  return <>
    <SectionBlock heading="Services">
      <div className="flex-1" key={'services' + parkingdata.ID}>
        {displayedServices.map(service => (
          <div key={service.ID}>
            {service.Name}
          </div>
        ))}
      </div>
    </SectionBlock>
    <HorizontalDivider className="my-4" />
  </>
};

export default ParkingViewServices;
