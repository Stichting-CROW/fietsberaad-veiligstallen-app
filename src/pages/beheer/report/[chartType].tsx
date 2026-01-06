import React, { useEffect, useState } from 'react';
import { type GetServerSidePropsContext, type GetServerSidePropsResult } from 'next';
import type { Session } from "next-auth";
import { getServerSession } from "next-auth/next"
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { useRouter } from "next/router";

import TopBar from "~/components/beheer/TopBar";
import { renderLeftMenu } from "~/utils/renderLeftMenu";
import ReportComponent from '~/components/beheer/reports';
import { VSMenuTopic } from "~/types/index";
import { VSSecurityTopic } from "~/types/securityprofile";
import { userHasRight } from "~/types/utils";
import { useSession } from "next-auth/react";
import { useDispatch } from 'react-redux';
import { setActiveMunicipalityInfo } from '~/store/adminSlice';
import { getMunicipalityById } from '~/utils/municipality';
import { VSContact } from '~/types/contacts';
import { useGemeentenInLijst } from '~/hooks/useGemeenten';
import { useExploitanten } from '~/hooks/useExploitanten';
import { useFietsenstallingenCompact } from '~/hooks/useFietsenstallingenCompact';
import { CHART_TYPE_MAP } from '~/components/beheer/reports';

export const getServerSideProps = async (context: GetServerSidePropsContext): Promise<GetServerSidePropsResult<ReportPageProps>> => {
  const session = await getServerSession(context.req, context.res, authOptions) as Session;

  // Check if there is no session (user not logged in)
  if (!session) {
    return { redirect: { destination: "/login?redirect=/beheer", permanent: false } };
  }

  return { props: {} };
};

export type ReportPageProps = {};

const ReportPage: React.FC<ReportPageProps> = () => {
  const dispatch = useDispatch();
  const queryRouter = useRouter();
  const { data: session, update: updateSession } = useSession();

  const selectedContactID = session?.user?.activeContactId || "";
  
  const { gemeenten } = useGemeentenInLijst();
  const { exploitanten } = useExploitanten(selectedContactID);
  const { fietsenstallingen: bikeparks } = useFietsenstallingenCompact(selectedContactID);

  const showAbonnementenRapporten = true;

  const firstDate = new Date("2018-03-01");
  const lastDate = new Date();
  lastDate.setHours(0, 0, 0, 0);

  // Get chart type from URL
  const chartTypeSlug = Array.isArray(queryRouter.query.chartType) 
    ? queryRouter.query.chartType[0] 
    : queryRouter.query.chartType;

  const initialReportType = chartTypeSlug && typeof chartTypeSlug === 'string' 
    ? CHART_TYPE_MAP[chartTypeSlug] 
    : undefined;

  // Redirect to first chart if invalid or missing chart type
  useEffect(() => {
    if (!chartTypeSlug || !initialReportType) {
      queryRouter.replace('/beheer/report/afgeronde-transacties');
    }
  }, [chartTypeSlug, initialReportType, queryRouter]);

  // Set activeMunicipalityInfo in redux
  useEffect(() => {
    const setActiveMunicipalityInfoInRedux = async (contactID: string) => {
      const municipality = await getMunicipalityById(contactID) as unknown as VSContact;
      if (municipality) {
        dispatch(setActiveMunicipalityInfo(municipality));
      }
    };
    setActiveMunicipalityInfoInRedux(selectedContactID);
  }, [selectedContactID, dispatch]);

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

      const { user } = await response.json();
      await updateSession({
        ...session,
        user
      });

      queryRouter.replace('/beheer/home');
    } catch (error) {
      console.error("Error switching contact:", error);
    }
  };

  const gemeentenaam = gemeenten?.find(gemeente => gemeente.ID === selectedContactID)?.CompanyName || "";
  const exploitantnaam = exploitanten?.find(exploitant => exploitant.ID === selectedContactID)?.CompanyName || "";

  // Check if user has access to reports
  const hasRapportages = userHasRight(session?.user?.securityProfile, VSSecurityTopic.rapportages);

  // For report page, only Gemeente should allow navigation, others use empty handler
  const handleReportPageSelect = (componentKey: VSMenuTopic) => {
    if (gemeenten.find(gemeente => gemeente.ID === selectedContactID)) {
      handleSelectComponent(componentKey);
    }
    // For Fietsberaad and Exploitant, do nothing (empty handler)
  };

  const leftMenuElement = renderLeftMenu({
    selectedContactID,
    activecomponent: VSMenuTopic.Report,
    securityProfile: session?.user?.securityProfile,
    gemeenten: gemeenten || [],
    exploitanten: exploitanten || [],
    onSelect: handleReportPageSelect,
    hasAbonnementenModule: true,
  });

  if (!hasRapportages) {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
        <TopBar
          gemeenten={gemeenten}
          exploitanten={exploitanten}
          ownOrganisationID={session?.user?.mainContactId || ""}
          selectedOrganisatieID={selectedContactID}
          onOrganisatieSelect={handleSelectGemeente}
        />
        <div className="flex">
          {leftMenuElement}
          <div className="flex-1 overflow-auto px-5 py-6 lg:px-10 lg:py-8" style={{ maxHeight: 'calc(100vh - 64px)' }}>
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
          </div>
        </div>
      </div>
    );
  }

  if (selectedContactID === "") {
    return (
      <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
        <TopBar
          gemeenten={gemeenten}
          exploitanten={exploitanten}
          ownOrganisationID={session?.user?.mainContactId || ""}
          selectedOrganisatieID={selectedContactID}
          onOrganisatieSelect={handleSelectGemeente}
        />
        <div className="flex">
          {leftMenuElement}
          <div className="flex-1 overflow-auto px-5 py-6 lg:px-10 lg:py-8" style={{ maxHeight: 'calc(100vh - 64px)' }}>
            <div className="text-center text-gray-500 mt-10 text-xl">
              Selecteer een gemeente om rapportages te bekijken
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-gray-50">
      <TopBar
        gemeenten={gemeenten}
        exploitanten={exploitanten}
        ownOrganisationID={session?.user?.mainContactId || ""}
        selectedOrganisatieID={selectedContactID}
        onOrganisatieSelect={handleSelectGemeente}
      />
      <div className="flex">
        {leftMenuElement}
        <div className="flex-1 overflow-auto px-5 py-6 lg:px-10 lg:py-8" style={{ maxHeight: 'calc(100vh - 64px)' }}>
          <ReportComponent
            showAbonnementenRapporten={showAbonnementenRapporten}
            firstDate={firstDate}
            lastDate={lastDate}
            bikeparks={bikeparks || []}
            initialReportType={initialReportType}
          />
        </div>
      </div>
    </div>
  );
};

export default ReportPage;

