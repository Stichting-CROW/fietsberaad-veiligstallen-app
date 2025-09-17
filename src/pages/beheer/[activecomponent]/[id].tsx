import React, { useEffect, useState } from 'react';
import dynamic from 'next/dynamic';
import { type GetServerSidePropsContext, type GetServerSidePropsResult } from 'next';
import type { User, Session } from "next-auth";
import { getServerSession } from "next-auth/next"
import { authOptions } from '~/pages/api/auth/[...nextauth]'

import { useRouter } from "next/router";
const LeftMenuFietsberaad = dynamic(() => import('~/components/beheer/LeftMenuFietsberaad'), { ssr: false })// TODO Make SSR again
const LeftMenuGemeente = dynamic(() => import('~/components/beheer/LeftMenuGemeente'), { ssr: false })// TODO Make SSR again
const LeftMenuExploitant = dynamic(() => import('~/components/beheer/LeftMenuExploitant'), { ssr: false })// TODO Make SSR again

import TopBar from "~/components/beheer/TopBar";

// import AbonnementenComponent from '~/components/beheer/abonnementen';
import AccountsComponent from '~/components/beheer/accounts';
import ApisComponent from '~/components/beheer/apis';
import ArticlesComponent from '~/components/beheer/articles';
// import BarcodereeksenComponent from '~/components/beheer/barcodereeksen';
import GemeenteComponent from '~/components/beheer/contacts/gemeente';
import ExploitantComponent from '~/components/beheer/contacts/exploitant';
import DataproviderComponent from '~/components/beheer/contacts/dataprovider';
import DocumentsComponent from '~/components/beheer/documenten';
import ExportComponent from '~/components/beheer/exports';
import FaqComponent from '~/components/beheer/faq';
import HomeInfoComponent from '~/components/beheer/home';
import LogboekComponent from '~/components/beheer/logboek';
import FietsenstallingenComponent from '~/components/beheer/fietsenstallingen';
// import PresentationsComponent from '~/components/beheer/presentations';
// import ProductsComponent from '~/components/beheer/producten';
import ReportComponent from '~/components/beheer/reports';
import SettingsComponent from '~/components/beheer/settings';
import UsersComponent from '~/components/beheer/users';
import DatabaseComponent from '~/components/beheer/database';
import ExploreUsersComponent from '~/components/ExploreUsersComponent';
import ExploreGemeenteComponent from '~/components/ExploreGemeenteComponent';

import { VSMenuTopic } from "~/types/index";
import { VSSecurityTopic } from "~/types/securityprofile";
import { userHasRight } from "~/types/utils";

// import Styles from "~/pages/content.module.css";
import { useSession } from "next-auth/react";
// import ExploreLeftMenuComponent from '~/components/ExploreLeftMenuComponent';


import GemeenteEdit from '~/components/contact/GemeenteEdit';
import DatabaseApiTest from '~/components/beheer/test/DatabaseApiTest';
import { useFietsenstallingtypen } from '~/hooks/useFietsenstallingtypen';
import { useGemeentenInLijst } from '~/hooks/useGemeenten';
import { useFietsenstallingenCompact } from '~/hooks/useFietsenstallingenCompact';
import { useExploitanten } from '~/hooks/useExploitanten';
import ExploitantEdit from '~/components/contact/ExploitantEdit';
import { setActiveMunicipalityInfo } from '~/store/adminSlice';
import { useDispatch } from 'react-redux';
import { getMunicipalityById } from '~/utils/municipality';
import { VSContact } from '~/types/contacts';

// Access Denied Component
const AccessDenied: React.FC = () => {
  const [showComponent, setShowComponent] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      setShowComponent(true);
    }, 4000); // 4 seconds

    return () => clearTimeout(timer);
  }, []);

  if (!showComponent) {
    return <></>;
  }

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-50">
      <div className="max-w-md w-full bg-white shadow-lg rounded-lg p-6">
        <div className="text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-red-100">
            <svg className="h-6 w-6 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L3.732 16.5c-.77.833.192 2.5 1.732 2.5z" />
            </svg>
          </div>
          <h3 className="mt-4 text-lg font-medium text-gray-900">Toegang Geweigerd</h3>
          <p className="mt-2 text-sm text-gray-500">
            U heeft geen rechten om deze pagina te bekijken. Neem contact op met uw beheerder als u denkt dat dit een fout is.
          </p>
        </div>
      </div>
    </div>
  );
};

//   .ContentPage_Body h2 {
//     font-size: 1.1em;
//     font-weight: bold;
//   }
//   .ContentPage_Body ul {
//       list-style-type: disc;
//   }
//   .ContentPage_Body ul,
//   .ContentPage_Body ol {
//     margin: 1em 0;
//       padding: 0 0 0 40px;
//       margin-left: 0;
//     padding-left: 1em;
//   }
//   .ContentPage_Body li {
//     display: list-item;
//   }
//   .ContentPage_Body a {
//       text-decoration: underline;
//   }
//   .ContentPage_Body strong {
//       font-weight: bold;
//   }
//   .ContentPage_Body p {
//       margin-top: 5px;
//       margin-bottom: 15px;
//   }


export const getServerSideProps = async (context: GetServerSidePropsContext): Promise<GetServerSidePropsResult<BeheerPageProps>> => {
  const session = await getServerSession(context.req, context.res, authOptions) as Session;

  // Check if there is no session (user not logged in)
  if (!session) {
    return { redirect: { destination: "/login?redirect=/beheer", permanent: false } };
  }

  return { props: {} };
};

export type BeheerPageProps = {
  // currentUser?: User;
  // selectedContactID?: string;
  // fietsenstallingtypen: VSFietsenstallingType[];
};

const BeheerPage: React.FC<BeheerPageProps> = ({
  // currentUser,
  //fietsenstallingtypen
}) => {
  const dispatch = useDispatch();

  const queryRouter = useRouter();
  const { data: session, update: updateSession } = useSession();

  const selectedContactID = session?.user?.activeContactId || "";
  
  const { gemeenten, isLoading: gemeentenLoading, error: gemeentenError, reloadGemeenten } = useGemeentenInLijst();
  const { exploitanten, isLoading: exploitantenLoading, error: exploitantenError, reloadExploitanten } = useExploitanten(selectedContactID);
  const { fietsenstallingen: bikeparks, isLoading: bikeparksLoading, error: bikeparksError, reloadFietsenstallingen } = useFietsenstallingenCompact(selectedContactID);
  const { fietsenstallingtypen, isLoading: fietsenstallingtypenLoading, error: fietsenstallingtypenError, reloadFietsenstallingtypen } = useFietsenstallingtypen();

  const showAbonnementenRapporten = true;

  const firstDate = new Date("2018-03-01");

  const lastDate = new Date();
  lastDate.setHours(0, 0, 0, 0); // set time to midnight

  let activecomponent: VSMenuTopic | undefined = VSMenuTopic.Home;

  const validTopics = Object.values(VSMenuTopic) as string[];
  const activeComponentQuery = Array.isArray(queryRouter.query.activecomponent) ? queryRouter.query.activecomponent[0] : queryRouter.query.activecomponent;
  if (
    activeComponentQuery &&
    typeof activeComponentQuery === 'string' &&
    validTopics.includes(activeComponentQuery)
  ) {
    activecomponent = activeComponentQuery as VSMenuTopic;
  }

  // Set activeMunicipalityInfo in redux
  useEffect(() => {
    setActiveMunicipalityInfoInRedux(selectedContactID);
  }, [selectedContactID]);

  const setActiveMunicipalityInfoInRedux = async (contactID: string) => {
    const municipality = await getMunicipalityById(contactID) as unknown as VSContact;
    if (municipality) {
      dispatch(setActiveMunicipalityInfo(municipality));
    }
  }

  const handleSelectComponent = (componentKey: VSMenuTopic) => {
    try {
      // If navigating to fietsenstallingen, clear any existing parking ID from the URL
      if (componentKey === VSMenuTopic.Fietsenstallingen) {
        queryRouter.push(`/beheer/${componentKey}`);
      } else {
        queryRouter.push(`/beheer/${componentKey}`);
      }
    } catch (error) {
      console.error("Error in handleSelectComponent:", error);
    }
  };

  const handleSelectGemeente = async (organisatieID: string) => {
    try {
      if (!session) return;

      const response = await fetch('/api/security/switch-contact', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ contactId: organisatieID })
      });

      if (!response.ok) {
        alert("Het wisselen van contact is niet gelukt");
        return;
      }

      // Get user from response
      const { user } = await response.json();
      
      // Update the session with new user data
      const newSession = await updateSession({
        ...session,
        user
      });

      // Replace current page with home page, which will trigger a full reload
      queryRouter.replace('/beheer/home');

    } catch (error) {
      console.error("Error switching contact:", error);
    }
  };

  const gemeentenaam = gemeenten?.find(gemeente => gemeente.ID === selectedContactID)?.CompanyName || "";
  const exploitantnaam = exploitanten?.find(exploitant => exploitant.ID === selectedContactID)?.CompanyName || "";

  const contacts = [
    { ID: "1", CompanyName: "Fietsberaad" },
    ...gemeenten.map(gemeente => ({ID: gemeente.ID, CompanyName: gemeente.CompanyName || "Gemeente " + gemeente.ID})),
    ...exploitanten.map(exploitant => ({ID: exploitant.ID, CompanyName: exploitant.CompanyName || "Exploitant " + exploitant.ID}))
  ];

  const renderComponent = () => {
    try {
      let selectedComponent = undefined;
      
      // Check user rights for Fietsenstallingen access
      const hasFietsenstallingenAdmin = userHasRight(session?.user?.securityProfile, VSSecurityTopic.instellingen_fietsenstallingen_admin);
      const hasFietsenstallingenBeperkt = userHasRight(session?.user?.securityProfile, VSSecurityTopic.instellingen_fietsenstallingen_beperkt);
      const hasFietsenstallingenAccess = hasFietsenstallingenAdmin || hasFietsenstallingenBeperkt;
      
      switch (activecomponent) {
        case VSMenuTopic.Home:
          selectedComponent = <HomeInfoComponent gemeentenaam={gemeentenaam||exploitantnaam} />;
          break;
        case VSMenuTopic.Report:
          // Check if user has access to reports
          const hasRapportages = userHasRight(session?.user?.securityProfile, VSSecurityTopic.rapportages);
          if (!hasRapportages) {
            selectedComponent = <AccessDenied />;
          } else {
            selectedContactID !== "" ? (
              selectedComponent = <ReportComponent
                showAbonnementenRapporten={showAbonnementenRapporten}
                firstDate={firstDate}
                lastDate={lastDate}
                bikeparks={bikeparks || []}
                // gemeenten={gemeenten || []}
                // users={users || []}
              />
            ) : (
              selectedComponent = <div className="text-center text-gray-500 mt-10 text-xl" >Selecteer een gemeente om rapportages te bekijken</div>
            )
          }
          break;
        case VSMenuTopic.ArticlesPages:
          // Check if user has access to site content
          const hasInstellingenSiteContent = userHasRight(session?.user?.securityProfile, VSSecurityTopic.instellingen_site_content);
          if (!hasInstellingenSiteContent) {
            selectedComponent = <AccessDenied />;
          } else {
            selectedComponent = <ArticlesComponent/>
          }
          break;
        case VSMenuTopic.Faq:
          // Check if user has access to site content
          const hasFaqSiteContent = userHasRight(session?.user?.securityProfile, VSSecurityTopic.instellingen_site_content);
          if (!hasFaqSiteContent) {
            selectedComponent = <AccessDenied />;
          } else {
            selectedComponent = <FaqComponent />;
          }
          break;
        case VSMenuTopic.Database:
          // Check if user has access to reports (database is used for report cache management)
          const hasDatabaseRapportages = userHasRight(session?.user?.securityProfile, VSSecurityTopic.rapportages);
          if (!hasDatabaseRapportages) {
            selectedComponent = <AccessDenied />;
          } else {
            selectedComponent = <DatabaseComponent bikeparks={bikeparks} firstDate={firstDate} lastDate={lastDate} />;
          }
          break;
        case VSMenuTopic.Export:
          // Check if user has access to reports (export is report-related)
          const hasExportRapportages = userHasRight(session?.user?.securityProfile, VSSecurityTopic.rapportages);
          if (!hasExportRapportages) {
            selectedComponent = <AccessDenied />;
          } else {
            selectedComponent = <ExportComponent
              gemeenteID={selectedContactID}
              gemeenteName={gemeentenaam}
              firstDate={firstDate}
              lastDate={lastDate}
              bikeparks={bikeparks || []}
            />;
          }
          break;
        case VSMenuTopic.Documents:
          selectedComponent = <DocumentsComponent />;
          break;
        case VSMenuTopic.ContactsGemeenten:
          selectedComponent = (
            <GemeenteComponent fietsenstallingtypen={fietsenstallingtypen || []}/>
          );
          break;
        case VSMenuTopic.ContactsExploitanten:
          selectedComponent = <ExploitantComponent contactID={selectedContactID} canManageExploitants={selectedContactID==="1"} canAddRemoveExploitants={selectedContactID!=="1"} />;
          break;
        case VSMenuTopic.ContactsDataproviders:
          selectedComponent = <DataproviderComponent />;
          break;
        case VSMenuTopic.ExploreUsers:
          selectedComponent = <ExploreUsersComponent />;
          break;
        // case VSMenuTopic.ExploreUsersColdfusion:
        //   selectedComponent = <ExploreUsersComponentColdfusion />;
        //   break;
        case VSMenuTopic.ExploreGemeenten:
          selectedComponent = <ExploreGemeenteComponent />;
          break;
        case VSMenuTopic.Logboek:
          selectedComponent = <LogboekComponent />;
          break;
        case VSMenuTopic.UsersGebruikersbeheerFietsberaad:
          selectedComponent = <UsersComponent siteID={"1"} contacts={contacts} />;
          break;
        case VSMenuTopic.UsersGebruikersbeheerGemeente:
          selectedComponent = <UsersComponent siteID={selectedContactID} contacts={contacts} />;
          break;
        case VSMenuTopic.UsersGebruikersbeheerExploitant:
          selectedComponent = <UsersComponent siteID={selectedContactID} contacts={contacts} />;
          break;
        case VSMenuTopic.UsersGebruikersbeheerBeheerder:
          selectedComponent = <UsersComponent siteID={selectedContactID} contacts={contacts} />;
          break;
        case VSMenuTopic.Fietsenstallingen:
          if (!hasFietsenstallingenAccess) {
            selectedComponent = <AccessDenied />;
          } else {
            selectedComponent = <FietsenstallingenComponent type="fietsenstallingen" />;
          }
          break;
        case VSMenuTopic.Fietskluizen:
          if (!hasFietsenstallingenAccess) {
            selectedComponent = <AccessDenied />;
          } else {
            selectedComponent = <FietsenstallingenComponent type="fietskluizen" />;
          }
          break;
        case VSMenuTopic.Buurtstallingen:
          if (!hasFietsenstallingenAccess) {
            selectedComponent = <AccessDenied />;
          } else {
            selectedComponent = <FietsenstallingenComponent type="buurtstallingen" />;
          }
          break;
        // case VSMenuTopic.BarcodereeksenUitgifteBarcodes:
        //   selectedComponent = <BarcodereeksenComponent type="uitgifte-barcodes" />;
        //   break;
        // case VSMenuTopic.BarcodereeksenSleutelhangers:
        //   selectedComponent = <BarcodereeksenComponent type="sleutelhangers" />;
        //   break;
        // case VSMenuTopic.BarcodereeksenFietsstickers:
        //   selectedComponent = <BarcodereeksenComponent type="fietsstickers" />;
        //   break;
        // case VSMenuTopic.Presentations:
        //   selectedComponent = <PresentationsComponent />;
        //   break;
        case VSMenuTopic.Settings:
          selectedComponent = <SettingsComponent />;
          break;
        case VSMenuTopic.SettingsGemeente:
          selectedComponent =           
            <GemeenteEdit 
              fietsenstallingtypen={fietsenstallingtypen || []}
              id={selectedContactID} 
              onClose={undefined} 
            />
          break;
        case VSMenuTopic.SettingsExploitant:
          selectedComponent =           
            <ExploitantEdit 
              id={selectedContactID} 
              onClose={undefined} 
            />
          break;
            // case VSMenuTopic.Abonnementen:
        //   selectedComponent = <AbonnementenComponent type="abonnementen" />;
        //   break;
        // case VSMenuTopic.Abonnementsvormen:
        //   selectedComponent = <AbonnementenComponent type="abonnementsvormen" />;
        //   break;
        case VSMenuTopic.Accounts:
          selectedComponent = <AccountsComponent />;
          break;
        case VSMenuTopic.ApisGekoppeldeLocaties:
          selectedComponent = <ApisComponent type="gekoppelde-locaties" />;
          break;
        case VSMenuTopic.ApisOverzicht:
          selectedComponent = <ApisComponent type="overzicht" />;
          break;
        // case VSMenuTopic.StallingInfo:
        //   selectedComponent = <StallingInfoComponent />;
        //   break;
        case VSMenuTopic.TestDatabaseApi:
          selectedComponent = <DatabaseApiTest />;
          break;
        default:
          console.warn("unknown component", activecomponent);
          selectedComponent = undefined;
          break;
      }

      return selectedComponent;
    } catch (error) {
      console.error("Error rendering component:", error);
      return <div>Error loading component</div>;
    }
  }

  const renderLeftMenu = () => {
    // If user is Fietsberaad, show the Fietsberaad left menu
    if (selectedContactID === "1") {
      return <LeftMenuFietsberaad
        securityProfile={session?.user?.securityProfile}
        activecomponent={activecomponent}
        onSelect={(componentKey: VSMenuTopic) => handleSelectComponent(componentKey)} // Pass the component key
      />
    }
    else if (gemeenten.find(gemeente => gemeente.ID === selectedContactID)) {
      return <LeftMenuGemeente
        securityProfile={session?.user?.securityProfile}
        activecomponent={activecomponent}
        onSelect={(componentKey: VSMenuTopic) => handleSelectComponent(componentKey)} // Pass the component key
      />
    }
    else if (exploitanten.find(exploitant => exploitant.ID === selectedContactID)) {
      return <LeftMenuExploitant
        securityProfile={session?.user?.securityProfile}
        activecomponent={activecomponent}
        onSelect={(componentKey: VSMenuTopic) => handleSelectComponent(componentKey)} // Pass the component key
      />
    }
    // By default: render empty left menu
    else {
      return <ul id="leftMenu" className="shadow w-64 h-[calc(100vh-64px)] overflow-y-auto p-4" />
    }
  }

  return (
    <div className="flex flex-col h-screen overflow-y-hidden">
      <TopBar
        gemeenten={gemeenten}
        exploitanten={exploitanten}
        ownOrganisationID={session?.user?.mainContactId || ""}
        selectedOrganisatieID={selectedContactID}
        onOrganisatieSelect={handleSelectGemeente}
      />
      <div className="flex">
        {renderLeftMenu()}

        {/* Main Content */}
        {/* ${Styles.ContentPage_Body}`} */}
        <div className={`flex-1 p-4 overflow-auto`} style={{ maxHeight: 'calc(100vh - 64px)' }}>
          {renderComponent()}
        </div>
      </div>
    </div>
  );
};

export default BeheerPage;
