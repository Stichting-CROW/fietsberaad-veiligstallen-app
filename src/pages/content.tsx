import React, { useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { type NextPage } from "next/types";
import { type GetServerSidePropsContext } from 'next';
import { useSelector, useDispatch } from "react-redux";
import { getServerSession } from "next-auth/next";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import Head from "next/head";
import { usePathname } from 'next/navigation';
import { type AppState } from "~/store/store";

// Import components
import PageTitle from "~/components/PageTitle";
import AppHeader from "~/components/AppHeader";
import ParkingFacilityBrowser from "~/components/ParkingFacilityBrowser";
import Modal from "src/components/Modal";
import Overlay from "src/components/Overlay";
import Parking from "~/components/Parking";
import Faq from "~/components/Faq";
import FooterNav from "~/components/FooterNav";

import Styles from "./content.module.css";
import { LoadingSpinner } from "~/components/beheer/common/LoadingSpinner";

import {
  getMunicipalityBasedOnUrlName
} from "~/utils/municipality";

import {
  setActiveMunicipalityInfo,
} from "~/store/mapSlice";
import { useFietsenstallingen } from "~/hooks/useFietsenstallingen";

const Content: NextPage = () => {
  
  const dispatch = useDispatch();
  const pathName = usePathname();

  const [currentStallingId, setCurrentStallingId] = useState<string | undefined>(undefined);
  const [pageContent, setPageContent] = useState<Record<string, any> | undefined | false>(undefined); // TODO: type -> generic JSON object, make more specific later

  const { fietsenstallingen: allparkingdata } = useFietsenstallingen(undefined);

  const activeMunicipalityInfo = useSelector(
    (state: AppState) => state.map.activeMunicipalityInfo
  );

  // Do things is municipality if municipality is given by URL
  useEffect(() => {
    const municipalitySlug = pathName.split('/')[pathName.split('/').length - 2];
    if (!municipalitySlug) return;

    // Get municipality based on urlName
    (async () => {
      // Get municipality
      const municipality = await getMunicipalityBasedOnUrlName(municipalitySlug);
      // Set municipality info in redux
      dispatch(setActiveMunicipalityInfo(municipality));
    })();
  }, [
    pathName
  ]);

  // Get article content based on slug
  useEffect(() => {
    if (!pathName) return;
    if (!activeMunicipalityInfo || !activeMunicipalityInfo.ID) return;
    const pageSlug = pathName.split('/')[pathName.split('/').length - 1];
    if (!pageSlug) return;

    (async () => {
      try {
        const response = await fetch(
          `/api/protected/articles/?compact=false&Title=${pageSlug}&SiteID=${activeMunicipalityInfo.ID}&findFirst=true`
        );
        const json = await response.json();
        if (!json.data) {
          setPageContent(false);
          return;
        }

        // If result is an array with 1 node: Get node only
        const pageContentToSet = json.data;
        setPageContent(pageContentToSet);
      } catch (err) {
        setPageContent(false);
        console.error(err);
      }
    })();
  }, [
    pathName,
    activeMunicipalityInfo
  ]);

  const isSm = typeof window !== "undefined" && window.innerWidth < 640;
  const isLg = typeof window !== "undefined" && window.innerWidth < 768;

  if(pageContent === undefined) {
    console.debug("===> Content - pageContent is undefined");
    return <LoadingSpinner />;
  }

  if (pageContent === false) {
    console.debug("===> Content - pageContent is false");
    return (<div className="p-10">
      Geen pagina-inhoud gevonden. <a href="javascript:history.back();" className="underline">Ga terug</a>
    </div>);
  }

  const isFaq = pageContent.Title === 'FAQ';

  // Decide on what parkings to show on this page, if any
  let parkingTypesToFilterOn: string[] | undefined;
  if (pageContent && pageContent.Title === 'Stallingen') {
    parkingTypesToFilterOn = ['bewaakt', 'geautomatiseerd', 'onbewaakt', 'toezicht'];
  }
  else if (pageContent && pageContent.Title === 'Buurtstallingen') {
    parkingTypesToFilterOn = ['buurtstalling'];
  }
  else if (pageContent && (pageContent.Title === 'Fietstrommels' || pageContent.Title === 'fietstrommels')) {
    parkingTypesToFilterOn = ['fietstrommel'];
  }
  else if (pageContent && pageContent.Title === 'Fietskluizen') {
    parkingTypesToFilterOn = ['fietskluizen'];
  }

  return (
    <>
      <Head>
        <title>
          {activeMunicipalityInfo
            ? `${activeMunicipalityInfo.CompanyName} - VeiligStallen`
            : 'VeiligStallen'}
        </title>
      </Head>

      <AppHeader showGemeenteMenu={activeMunicipalityInfo!==undefined} />

      <div className={`
				lg:mt-16
				p-4
				sm:pt-20
				container
				mx-auto

			 flex-wrap lg:flex justify-between lg:flex-nowrap

				${Styles.ContentPage_Body}
			`}>
        <div className="
					flex-1
					lg:mr-24
				">
          {(pageContent.DisplayTitle || pageContent.Title) ? <PageTitle>
            {pageContent.DisplayTitle ? pageContent.DisplayTitle : pageContent.Title}
          </PageTitle> : ''}
          {pageContent.Abstract ? <div className="
						text-lg
						my-4
					"
            dangerouslySetInnerHTML={{ __html: pageContent.Abstract }}
          /> : ''}

          {pageContent.Article ? <div className="
						my-4
						mt-12
					"
            dangerouslySetInnerHTML={{ __html: pageContent.Article }}
          /> : ''}

          {isFaq && <>
            <Faq />
          </>}
        </div>
        <div className="
					mt-10
					p-4
					max-w-full
				"
          style={{
            width: '414px'
          }}
        >
          {parkingTypesToFilterOn && <ParkingFacilityBrowser
            customFilter={(parkingdata) => {
              return parkingTypesToFilterOn.indexOf(parkingdata.Type||"") > -1
                && (
                  // Check if parking municipality == active municipality
                  (activeMunicipalityInfo?.CompanyName && activeMunicipalityInfo.CompanyName.toLowerCase().indexOf(parkingdata.Plaats?.toLowerCase()) > -1)
                  // Hide parkings without municipality, if municipality is set
                  // This makes sure not all Dutch NS stallingen are shown on a municipality page
                  && (parkingdata.Plaats && parkingdata.Plaats.length > 0)
                );
            }}
            onShowStallingDetails={(id: any) => {
              setCurrentStallingId(id);
            }}
            allparkingdata={allparkingdata}
          />}
        </div>
      </div>

      {currentStallingId !== undefined && isSm && (<>
        <Overlay
          title={""}
          onClose={() => setCurrentStallingId(undefined)}
        >
          <Parking id={'parking-' + currentStallingId}
            stallingId={currentStallingId}
            // allparkingdata={allparkingdata}
            onStallingIdChanged={newId => {
              console.log("content - onStallingIdChanged overlay", newId);
              setCurrentStallingId(newId);
            }}
            onClose={() => setCurrentStallingId(undefined)}
          />
        </Overlay>
      </>)}

      {currentStallingId !== undefined && !isSm && (<>
        <Modal
          onClose={() => setCurrentStallingId(undefined)}
          clickOutsideClosesDialog={false}
        >
          <Parking
            id={'parking-' + currentStallingId}
            stallingId={currentStallingId}
            // allparkingdata={allparkingdata}
            onStallingIdChanged={newId => {
              console.log("content - onStallingIdChanged modal", newId);
              setCurrentStallingId(newId);
            }}
            onClose={() => setCurrentStallingId(undefined)}
          />
        </Modal>
      </>)}

      <FooterNav />
    </>
  );
};

export default Content;
