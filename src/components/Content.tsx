import React, { useState, useEffect } from "react";
import { useSelector, useDispatch } from "react-redux";
import Head from "next/head";
import { type AppState } from "~/store/store";

// Import components
import PageTitle from "~/components/PageTitle";
import AppHeader from "~/components/AppHeader";
import Modal from "src/components/Modal";
import Overlay from "src/components/Overlay";
import Parking from "~/components/Parking";
import Faq from "~/components/Faq";
import FooterNav from "~/components/FooterNav";

import Styles from "./Content.module.css";
import { LoadingSpinner } from "~/components/beheer/common/LoadingSpinner";

import {
  getMunicipalityBasedOnUrlName
} from "~/utils/municipality";

import {
  setActiveMunicipalityInfo,
} from "~/store/mapSlice";

import { ParkingDetailsType } from "~/types/parking";
import { useFietsenstallingen } from "~/hooks/useFietsenstallingen";

import ParkingFacilityBrowserStyles from '~/components/ParkingFacilityBrowser.module.css';
import ParkingFacilityBlock from "~/components/ParkingFacilityBlock";

const Content: React.FC<{ url_municipality: string, url_municipalitypage: string }> = (props: { url_municipality: string, url_municipalitypage: string }) => {
  
  const dispatch = useDispatch();

  const activeMunicipalityInfo = useSelector(
    (state: AppState) => state.map.activeMunicipalityInfo
  );

  const [currentStallingId, setCurrentStallingId] = useState<string | undefined>(undefined);
  const [pageContent, setPageContent] = useState<Record<string, any> | undefined | false>(undefined); // TODO: type -> generic JSON object, make more specific later

  // const { fietsenstallingen: allparkingdata } = useAllFietsenstallingen();
  const { fietsenstallingen: allparkingdata } = useFietsenstallingen(activeMunicipalityInfo?.ID||"");
  const [ filteredstallingen, setFilteredstallingen] = useState<ParkingDetailsType[]>([]);

  // Do things is municipality if municipality is given by URL
  useEffect(() => {
    // Get municipality based on urlName
    (async () => {
      if(!props.url_municipality) return;
      // Get municipality
      const municipality = await getMunicipalityBasedOnUrlName(props.url_municipality);
      // Set municipality info in redux
      dispatch(setActiveMunicipalityInfo(municipality));
    })();
  }, [
    props.url_municipality
  ]);

  // Get article content based on slug
  useEffect(() => {
    if (!props.url_municipalitypage) {
      console.warn("===> Content - no municipality given");
      return;
    }
    // if (!pathName) return;
    if (!activeMunicipalityInfo || !activeMunicipalityInfo.ID) {
      console.debug("===> Content - no active municipality ID available");
      return;
    }

    (async () => {
      try {
        const url = `/api/protected/articles/?compact=false&Title=${props.url_municipalitypage}&SiteID=${activeMunicipalityInfo.ID}&findFirst=true`;
        console.log("#### Content - Fetch pagecontent via url", url);
        const response = await fetch(url);
        const json = await response.json();
        if (!json.data) {
          setPageContent(false);
          setFilteredstallingen([]);
          return;
        }

        // If result is an array with 1 node: Get node only
        const pageContentToSet = json.data;
        setPageContent(pageContentToSet);

        // Decide on what parkings to show on this page, if any
        const title = pageContentToSet.Title;
        let parkingTypesToFilterOn: string[] = [];
        if (title === 'Stallingen') {
          parkingTypesToFilterOn = ['bewaakt', 'geautomatiseerd', 'onbewaakt', 'toezicht'];
        }
        else if (title === 'Buurtstallingen') {
          parkingTypesToFilterOn = ['buurtstalling'];
        }
        else if (title === 'Fietstrommels' || title === 'fietstrommels') {
          parkingTypesToFilterOn = ['fietstrommel'];
        }
        else if (title === 'Fietskluizen') {
          parkingTypesToFilterOn = ['fietskluizen'];
        } else {
          parkingTypesToFilterOn = [];
        }

        const filtered = allparkingdata.filter(parking => parkingTypesToFilterOn.indexOf(parking.Type||"") > -1);
        setFilteredstallingen(filtered);      
      } catch (err) {
        setPageContent(false);
        setFilteredstallingen([]);
        console.error(err);
      }
    })();
  }, [
    activeMunicipalityInfo,
    allparkingdata,
    props.url_municipalitypage,
    props.url_municipality
  ]);

  const renderParkings = () => {
    if (filteredstallingen.length === 0) {
      return null;
    }
    return (
      <div
      className={`
        ${ParkingFacilityBrowserStyles.ParkingFacilityBrowser}
        ParkingFacilityBrowser
        rounded-3xl
        bg-white
        py-0
        text-left
        shadow-lg
      `}
      style={{
        maxWidth: "100%",
        // height: "100%",
        overflow: "auto",
      }}
    >
        {(filteredstallingen || []).map((x) => {
          return (
            <div className="mb-0 ml-0 mr-0" key={x.ID}>
              <ParkingFacilityBlock
                id={'parking-facility-block-' + x.ID}
                parking={x}
                compact={x.ID !== currentStallingId}
                expandParkingHandler={() => {setCurrentStallingId(x.ID)}}
                openParkingHandler={() => {}}
              />
            </div>
          );
        })}

      </div>
    );
  }

  const isSm = typeof window !== "undefined" && window.innerWidth < 640;
  const isLg = typeof window !== "undefined" && window.innerWidth < 768;

  if(pageContent === undefined) {
    console.debug("===> Content - pageContent is undefined");
    return <LoadingSpinner />;
  }

  console.debug("===> Content - pageContent is ", pageContent);

  if (pageContent === false) {
    console.debug("===> Content - pageContent is false");
    return (<div className="p-10">
      Geen pagina-inhoud gevonden. <a href="javascript:history.back();" className="underline">Ga terug</a>
    </div>);
  }

  const isFaq = pageContent.Title === 'FAQ';


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
          {renderParkings()}
        </div>
      </div>

      {currentStallingId !== undefined && isSm && (<>
        <Overlay
          title={""}
          onClose={() => setCurrentStallingId(undefined)}
        >
          <Parking id={'parking-' + currentStallingId}
            stallingId={currentStallingId}
            onStallingIdChanged={newId => {
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
            onStallingIdChanged={newId => {
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
