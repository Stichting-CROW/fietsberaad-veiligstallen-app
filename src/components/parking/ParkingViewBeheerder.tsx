import React from "react";
import { type ParkingDetailsType } from "~/types/parking";
import SectionBlock from "~/components/SectionBlock";

const ParkingViewBeheerder = ({ parkingdata }: { parkingdata: ParkingDetailsType }) => {
  // if (parkingdata.FMS === true) {
  //   return <SectionBlock heading="Beheerder">FMS</SectionBlock>;
  // }  else
  if (parkingdata?.exploitant) {
    return (
      <SectionBlock heading="Beheerder">
        <a 
          href={'mailto:' + parkingdata.exploitant.Helpdesk}
          style={{
            textDecoration: 'underline',
            color: '#2563eb',
            cursor: 'pointer'
          }}
          className="hover:text-blue-700 hover:underline"
        >
          {parkingdata.exploitant.CompanyName}
        </a>
      </SectionBlock>
    )
  } else if (parkingdata.BeheerderContact !== null) {
    let contactlink = "";
    if (parkingdata.BeheerderContact.includes("@")) {
      contactlink = 'mailto:' + parkingdata.BeheerderContact
    } else if (parkingdata.BeheerderContact.startsWith("http")) {
      contactlink = parkingdata.BeheerderContact;
    } else if (parkingdata.BeheerderContact.startsWith("www")) {
      contactlink = 'https://' + parkingdata.BeheerderContact;
    }

    if(contactlink === "https://www.nsfiets.nl") {
      contactlink = "https://www.ns.nl/fietsenstallingen/";
    }

    return (
      <SectionBlock heading="Beheerder">
        <a 
          href={contactlink} 
          style={{
            textDecoration: 'underline',
            color: '#2563eb',
            cursor: 'pointer'
          }}
          className="hover:text-blue-700 hover:underline"
          target="_blank"
          rel="noopener noreferrer"
        >
          {parkingdata.Beheerder === null ? parkingdata.BeheerderContact : parkingdata.Beheerder}
        </a>
      </SectionBlock>
    );
  } else {
    return null
  }
};

export default ParkingViewBeheerder;
