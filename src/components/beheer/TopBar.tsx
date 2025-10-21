import React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSelector } from "react-redux";
import { useSession, signOut } from "next-auth/react"
import { type AppState } from "~/store/store";
import type { VSContactExploitant, VSContactGemeenteInLijst, VSContact } from "~/types/contacts";
import { getNewRoleLabel, logSession } from '~/types/utils';
import { getOrganisationByID } from "~/utils/organisations";
import ImageWithFallback from "~/components/common/ImageWithFallback";

interface TopBarProps {
  gemeenten: VSContactGemeenteInLijst[] | undefined;
  exploitanten: VSContactExploitant[] | undefined;
  ownOrganisationID: string | undefined;
  selectedOrganisatieID: string | undefined;
  onOrganisatieSelect: (gemeenteID: string) => void;
}

const getSelectedOrganisationInfo = (gemeenten: VSContactGemeenteInLijst[], exploitanten: VSContactExploitant[], selectedOrganisatieID: string) => {
  // Merge gemeenten and exploitanten
  const organisations = [...gemeenten, ...exploitanten];
  // Get organisation info
  const organisation: VSContact | undefined = getOrganisationByID(organisations as unknown as VSContact[], selectedOrganisatieID || "");

  return organisation;
}

const TopBar: React.FC<TopBarProps> = ({
  gemeenten,
  exploitanten,
  ownOrganisationID,
  selectedOrganisatieID,
  onOrganisatieSelect,
}) => {
  const { push } = useRouter();
  const { data: session } = useSession()

  const activeMunicipalityInfo = useSelector((state: AppState) => {
    // If path is like /beheer/*, return the activeMunicipalityInfo from the map slice
    // Make sure it works on server side
    if (typeof window !== 'undefined' && window.location.pathname.startsWith('/beheer/')) {
      return state.admin?.activeMunicipalityInfo
    }
    return state.map.activeMunicipalityInfo
  });

  const themeColor1 = activeMunicipalityInfo && activeMunicipalityInfo.ThemeColor1
    ? `#${activeMunicipalityInfo.ThemeColor1}`
    : '#15aeef';

  const themeColor2 = activeMunicipalityInfo && activeMunicipalityInfo.ThemeColor2
    ? `#${activeMunicipalityInfo.ThemeColor2}`
    : '#15aeef';

  const handleOrganisatieChange = (
    event: React.ChangeEvent<HTMLSelectElement>,
  ) => {
    event.preventDefault();
    onOrganisatieSelect(event.target.value);
  };

  const handleLoginClick = () => {
    if (!session) {
      push('/login?redirect=/beheer');
    } else {
      // sign out
      if(confirm('Wil je uitloggen?')) {
        signOut();
      }
    }
  };

  const handleDisplaySessionInfo = () => {
    if(process.env.NODE_ENV === 'development') {
      logSession(session );
    }
  };

  const gemeentenKort = gemeenten?.map(gemeente => ({
    ID: gemeente.ID,
    CompanyName: gemeente.CompanyName,
  })).sort((a, b) => {
    // If a is the main contact, it should come first
    if (a.ID === (session?.user?.mainContactId || "")) return -1;
    // If b is the main contact, it should come first
    if (b.ID === (session?.user?.mainContactId || "")) return 1;
    // Otherwise sort alphabetically
    return (a.CompanyName || '').localeCompare(b.CompanyName || '');
  });

  const exploitantenKort = exploitanten?.map(exploitant => ({
    ID: exploitant.ID,
    CompanyName: "** " + exploitant.CompanyName + " **",
  })).sort((a, b) => {
    // If a is the main contact, it should come first
    if (a.ID === (session?.user?.mainContactId || "")) return -1;
    // If b is the main contact, it should come first
    if (b.ID === (session?.user?.mainContactId || "")) return 1;
    // Otherwise sort alphabetically
    return (a.CompanyName || '').localeCompare(b.CompanyName || '');
  });

  const renderLogo = () => {
    const activecontact = selectedOrganisationInfo;
    // console.log('renderLogo :: activecontact', activecontact);
    
    if(activecontact?.CompanyLogo && activecontact?.CompanyLogo.indexOf('http') === 0) {
      //console.log('renderLogo :: activecontact.CompanyLogo starts with http');
      return <img src={activecontact?.CompanyLogo} className="max-h-16 w-auto bg-white p-2" />
    }

    let logofile ="https://fms.veiligstallen.nl/resources/client/logo.png";
    if(activecontact?.CompanyLogo && activecontact?.CompanyLogo !== null) {
      logofile = activecontact.CompanyLogo;
      if(!logofile.startsWith('http')) {
          logofile =logofile.replace('[local]', '/api')
          if(!logofile.startsWith('/')) {
            logofile = '/' + logofile;
          }
      }
      //console.log('renderLogo :: logofile from activecontact.CompanyLogo', logofile);

      return <ImageWithFallback
        src={logofile}
        fallbackSrc="https://fms.veiligstallen.nl/resources/client/logo.png"
        alt="Logo"
        width={64}
        height={64}
        className="max-h-16 w-auto bg-white p-2"
      />
    }

    return <img src="https://fms.veiligstallen.nl/resources/client/logo.png" className="max-h-16 w-auto bg-white p-2" />
  }


  const organisaties = [...(gemeentenKort || []), ...(exploitantenKort || [])].filter(organisatie => organisatie.ID !== ownOrganisationID);
  const selecteerOrganisatie = {
    ID: "selecteer",
    CompanyName: "Selecteer een organisatie",
  }

  organisaties.unshift(selecteerOrganisatie);

  let ownOrganisationName 
  if(ownOrganisationID === "1") {
    ownOrganisationName = "Fietsberaad";
  } else {
    const ownOrganisation = getSelectedOrganisationInfo(gemeenten || [], exploitanten || [], ownOrganisationID || "");
    ownOrganisationName = ownOrganisation?.CompanyName || "";
  }

  const selectedOrganisationInfo: VSContact | undefined = getSelectedOrganisationInfo(gemeenten || [], exploitanten || [], selectedOrganisatieID || "");

  const titlename = " " + (ownOrganisationID === selectedOrganisatieID ? ownOrganisationName : selectedOrganisationInfo?.CompanyName || "---");
  const title = `VeiligStallen ${titlename}`; 

  // Show organization list if user is fietsberaad or from exploitanten, show button if user is from gemeenten
  const isOwnOrganisation = ownOrganisationID === selectedOrganisatieID;
  const isExploitant = exploitanten?.some(exploitant => exploitant.ID === ownOrganisationID);
  const isFietsberaad = ownOrganisationID === "1";

  const shouldShowOrganisatieList = 
    isFietsberaad  && isOwnOrganisation ||
    isExploitant && isOwnOrganisation;
  
  const shouldShowBackButton = !isOwnOrganisation;

  const userRole = session?.user?.securityProfile?.roleId ? 
    ` (${getNewRoleLabel(session?.user?.securityProfile?.roleId)})` : "";

  return (
    <div
      className="
      z-10 flex w-full items-center
      justify-between bg-white px-5 shadow
    "
    style={{minHeight: '64px'}}
    >
      <div>
        {renderLogo()}
      </div>
      <div
        className="
        primaryMenuItems-wrapper

        flex-start
        flex flex-1 flex-wrap
        overflow-hidden text-left
        opacity-100
        transition-opacity
        duration-500
      
      "
        style={{ flex: 4 }}
      >
        <div className="PrimaryMenuItem bock px-5">
          <a
            href="/"
            className="flex h-full flex-col justify-center"
            onClick={e => {
              e.preventDefault();
              push("/");
            }}
          >
            <img src="/images/icon-map.png" style={{ height: "30px" }} />
          </a>
        </div>
        <div className="PrimaryMenuItem px-5">
          <h1 className="text-sm font-semibold">{title}</h1>
          {session?.user?.name && (
            <div className="font-normal text-xs" onClick={handleDisplaySessionInfo}>
              {session?.user?.name || "---"}{userRole}
            </div>
          )}
        </div>
      </div>
      <div
        className="flex items-center justify-end space-x-4 text-sm whitespace-nowrap"
        style={{ flex: 3 }}
      >
        {shouldShowOrganisatieList && organisaties && organisaties.length > 0 && (
          <select
            onChange={handleOrganisatieChange}
            value={selectedOrganisatieID || ""}
            className="rounded bg-gray-700 px-2 py-1 text-white"
          >
            {organisaties.map(organisatie => (
              <option
                key={`select-organisatie-option-${organisatie.ID}`}
                value={organisatie.ID}
              >
                {organisatie.CompanyName} {organisatie.ID===session?.user?.mainContactId ? " (mijn organisatie)" : ""}
              </option>
            ))}
          </select>
        )}
        
        {shouldShowBackButton && (
          <button
            onClick={() => onOrganisatieSelect(ownOrganisationID||"")}
            className="
              flex
              h-10
              flex-col
              justify-center
              rounded-md
              px-4
              font-bold
              text-white
              shadow-lg
            "
            style={{
              backgroundColor: themeColor1 || "#15aeef",
            }}
          >
            Terug naar {ownOrganisationName}
          </button>
        )}

        <a
          href="https://fms.veiligstallen.nl"
          target="_blank"
          className="
            mx-2
            flex
            h-10
            flex-col
            justify-center
            rounded-md
            px-4
            font-bold
            text-white
            shadow-lg
          "
          style={{
            backgroundColor: themeColor1 || "#15aeef",
          }}
          title="Ga naar het oude FMS beheersysteem"
        >
          FMS
        </a>

        <button
          className="
            mx-2
            h-10
            rounded-md
            px-4
            font-bold
            text-white
            shadow-lg
            whitespace-nowrap
          "
          style={{
            backgroundColor: themeColor2 || themeColor1,
          }}
          onClick={handleLoginClick}
        >
          {session ? "Log uit" : "Log in"}
        </button>
      </div>
    </div>
  );
};

export default TopBar;
