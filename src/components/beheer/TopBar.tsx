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
      return <img src={activecontact?.CompanyLogo} className="max-h-12 w-auto object-contain" />
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
        className="max-h-12 w-auto object-contain"
      />
    }

    return <img src="https://fms.veiligstallen.nl/resources/client/logo.png" className="max-h-12 w-auto object-contain" />
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
    <header className="z-10 w-full border-b border-gray-200 bg-white shadow-sm">
      <div
        className="flex w-full items-center justify-between gap-6 px-6"
        style={{ minHeight: '64px' }}
      >
        <div className="flex flex-1 items-center gap-4">
          <div className="flex h-14 w-14 items-center justify-center overflow-hidden rounded-xl border border-gray-200 bg-white">
            {renderLogo()}
          </div>
          <button
            type="button"
            onClick={e => {
              e.preventDefault();
              push("/");
            }}
            className="flex h-12 w-12 items-center justify-center rounded-xl border border-transparent bg-sky-50 text-sky-600 transition hover:border-sky-200 hover:bg-sky-100"
          >
            <img src="/images/icon-map.png" className="h-6 w-6" alt="Kaart" />
          </button>
          <div className="min-w-0">
            <p className="text-base font-semibold text-slate-900">{title}</p>
            {session?.user?.name && (
              <button
                type="button"
                onClick={handleDisplaySessionInfo}
                className="text-left text-sm font-medium text-slate-500 hover:text-slate-600"
              >
                {session?.user?.name || "---"}{userRole}
              </button>
            )}
          </div>
        </div>
        <div className="flex flex-none items-center justify-end gap-3 text-sm">
        {shouldShowOrganisatieList && organisaties && organisaties.length > 0 && (
          <select
            onChange={handleOrganisatieChange}
            value={selectedOrganisatieID || ""}
            className="
              h-10 rounded-lg border border-gray-300 bg-white px-3 font-medium text-slate-700 shadow-sm focus:border-sky-400 focus:outline-none focus:ring-1 focus:ring-sky-400
            "
            style={{
              maxWidth: '230px'
            }}
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
              inline-flex h-10 items-center justify-center rounded-lg px-4
              font-semibold text-white shadow-lg transition hover:brightness-110
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
            inline-flex h-10 items-center justify-center rounded-lg px-4
            font-semibold text-white shadow-lg transition hover:brightness-110
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
            inline-flex h-10 items-center justify-center whitespace-nowrap rounded-lg px-4
            font-semibold text-white shadow-lg transition hover:brightness-110
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
    </header>
  );
};

export default TopBar;
