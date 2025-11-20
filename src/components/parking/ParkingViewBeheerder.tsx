import React from "react";
import { type ParkingDetailsType } from "~/types/parking";
import SectionBlock from "~/components/SectionBlock";
import { useGemeente } from "~/hooks/useGemeente";

export const getSectionBlockBeheerder = (contactname: string, emailorurl: string) => {
  let contactlink = "";
  if (emailorurl.includes("@")) {
    contactlink = 'mailto:' + emailorurl
  } else if (emailorurl.startsWith("http")) {
    contactlink = emailorurl;
  } else if (emailorurl.startsWith("www")) {
    contactlink = 'https://' + emailorurl;
  } else {
    contactlink = '';
  }

  if(contactlink === "https://www.nsfiets.nl") {
    contactlink = "https://www.ns.nl/fietsenstallingen/";
  }

  if(contactlink !== "") {
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
          title={contactlink}
        >
          {contactname || contactlink}
        </a>
      </SectionBlock>)
    } else if (contactname !== "") {
      return (
        <SectionBlock heading="Beheerder">
          {contactname}
        </SectionBlock>
      )
    } else {
      return null
    }
}

const ParkingViewBeheerder = ({ parkingdata }: { parkingdata: ParkingDetailsType }) => {
  const { gemeente, isLoading: isLoadingGemeente, error: errorGemeente } = useGemeente(parkingdata.SiteID || "");

  if(parkingdata.SiteID===parkingdata.ExploitantID) {
    return getSectionBlockBeheerder(
        gemeente?.CompanyName || `Gemeente ${parkingdata.SiteID}`, 
        gemeente?.Helpdesk ? gemeente.Helpdesk : ''
      );
  } else if (parkingdata?.exploitant) {
    return getSectionBlockBeheerder(
      parkingdata.exploitant.CompanyName || parkingdata.exploitant.Helpdesk, 
      parkingdata.exploitant.Helpdesk ? parkingdata.exploitant.Helpdesk : ''
    );
  } else if (parkingdata.BeheerderContact !== null) {
    return getSectionBlockBeheerder(
      parkingdata.Beheerder || '', 
      parkingdata.BeheerderContact || ''
    );
  } else {
    return null
  }
};

export default ParkingViewBeheerder;
