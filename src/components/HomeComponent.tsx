import { useState, useEffect, useRef } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/router";
import Link from "next/link";

import {
  setIsParkingListVisible,
  setIsFilterBoxVisible,
  setIsMobileNavigationVisible,
  setActiveArticle,
} from "~/store/appSlice";
import {
  setActiveParkingId,
//  setActiveMunicipality,
  setActiveMunicipalityInfo,
  setInitialLatLng,
  setSelectedParkingId,
} from "~/store/mapSlice";

import { setQuery } from "~/store/filterSlice";

import {
  getMunicipalityBasedOnCbsCode,
  getMunicipalityBasedOnUrlName,
  cbsCodeFromMunicipality,
} from "~/utils/municipality";

import { convertCoordinatenToCoords } from "~/utils/map/index";

// import ParkingFacilities from "~/components/ParkingFacilities";
import AppHeader from "~/components/AppHeader";
import ParkingFacilityBrowser from "~/components/ParkingFacilityBrowser";
import Parking from "~/components/Parking";
import Modal from "src/components/Modal";
import Overlay from "src/components/Overlay";
import SearchBar from "~/components/SearchBar";
import CardList from "~/components/CardList";
import Logo from "~/components/Logo";
// import ActiveFilters from "~/components/ActiveFilters";
import FilterBox from "~/components/FilterBox";
import { IconButton } from "~/components/Button";
import { ToggleMenuIcon } from "~/components/ToggleMenuIcon";
import AppNavigationMobile from "~/components/AppNavigationMobile";
import MapboxMap from "~/components/MapComponent";
import ParkingFacilityBlock from "~/components/ParkingFacilityBlock";
import FooterNav from "~/components/FooterNav";

import { useSession } from "next-auth/react";
import { AppState } from "~/store/store";
import { createNewStalling } from "~/utils/parkings";
import { getMunicipalityBasedOnLatLng } from "~/utils/map/active_municipality"; 

import { Session } from "next-auth";
import ArticleComponent from "./ArticleComponent";
import { fietsenstallingen } from "~/generated/prisma-client";
import InfomodalComponent from "./InfomodalComponent";

interface HomeComponentProps {
    fietsenstallingen: fietsenstallingen[],
    online: boolean,
    message: string,
    url_municipality: string | undefined,
    url_municipalitypage: string | undefined
}

const HomeComponent = ({ fietsenstallingen, online, message, url_municipality, url_municipalitypage }: HomeComponentProps) => {
    const router = useRouter();
    const { query } = useRouter();
    const { data: session } = useSession();
  
    const currentLatLong = useSelector(
      (state: AppState) => state.map.currentLatLng,
    );
  
    const dispatch = useDispatch();
  
    const activeTypes = useSelector(
      (state: AppState) => state.filter.activeTypes,
    );

    const activeTypes2 = useSelector(
      (state: AppState) => state.filter.activeTypes2
    );

    const activeTypesArticles = useSelector(
      (state: AppState) => state.filterArticles.activeTypes,
    );
  
    const isParkingListVisible = useSelector(
      (state: AppState) => state.app.isParkingListVisible,
    );
  
    const isFilterBoxVisible = useSelector(
      (state: AppState) => state.app.isFilterBoxVisible,
    );
  
    const isMobileNavigationVisible = useSelector(
      (state: AppState) => state.app.isMobileNavigationVisible,
    );
  
    const activeMunicipalityInfo = useSelector(
      (state: AppState) => state.map.activeMunicipalityInfo,
    );

    const activeArticleTitle = useSelector(
      (state: AppState) => state.app.activeArticleTitle,
    );
    const activeArticleMunicipality = useSelector(
      (state: AppState) => state.app.activeArticleMunicipality,
    );
  
    const activeParkingId = useSelector(
      (state: AppState) => state.map.activeParkingId,
    );
  
    const currentLatLng = useSelector(
      (state: AppState) => state.map.currentLatLng,
    );
  
    const mapZoom = useSelector((state: AppState) => state.map.zoom);

    useEffect(() => {
      // handle aanmelden sequence
      if (
        router.query.stallingid !== undefined &&
        !Array.isArray(router.query.stallingid)
      ) {
        // Set active parking ID
        dispatch(setActiveParkingId(router.query.stallingid));
        dispatch(setSelectedParkingId(router.query.stallingid));
      }
    }, [router.query, router.query.stallingid, router.query.revision]);

    useEffect(() => {
      (async () => {
        const municipalitychanged = activeMunicipalityInfo?.UrlName !== url_municipality;
        const articlechanged = municipalitychanged || activeArticleTitle !== url_municipalitypage;
        console.debug("!!! HomeComponent - useEffect - municipalitychanged", municipalitychanged, articlechanged);

        if(!municipalitychanged && !articlechanged) {
          console.debug("!!!! HomeComponent - Prevent unnecessary update");
          return;
        }

        if(municipalitychanged) {
          const info = await getMunicipalityBasedOnUrlName(url_municipality||"fietsberaad");
          if (!info) return;

          dispatch(setActiveMunicipalityInfo(info));

          // Fly to url_municipality, on the map
          const initialLatLng = convertCoordinatenToCoords(
            info.Coordinaten,
          );
          if (initialLatLng) {
              dispatch(setInitialLatLng(initialLatLng));
          }
        }

        if(articlechanged) {
          dispatch(setActiveArticle({
            articleTitle: url_municipalitypage,
            municipality: activeMunicipalityInfo?.UrlName 
          }));
        }
    })();
    }, []);

    useEffect(() => {
      console.debug("#### HomeComponent - activeArticle changed", activeArticleMunicipality, activeArticleTitle);
    }, [activeArticleMunicipality, activeArticleTitle]);

    useEffect(() => {
      console.debug("#### HomeComponent - currentLatLng changed", currentLatLng);
      (async () => {
        const ddmunicipality = await getMunicipalityBasedOnLatLng(currentLatLng);
        if (!ddmunicipality) {
          console.warn("#### HomeComponent - no municipality found", currentLatLng);
          // updateUrl("root");
          return;
        }

        let cbsCode = cbsCodeFromMunicipality(ddmunicipality);
        if(cbsCode === false) {
          console.warn("#### HomeComponent - no valid cbsCode for the current location");
          // updateUrl("root");
          return;
        }
  
        // Get the municipality info from the database
        const municipalityInfo = await getMunicipalityBasedOnCbsCode(cbsCode);
        // Set municipality slug in URL
        if (mapZoom >= 12 && municipalityInfo && municipalityInfo.UrlName) {
          updateUrl("municipality", municipalityInfo.UrlName);
        }
        // If zoomed out, have just `/` as URL
        else {
          updateUrl("root");
        }

        // Set the municipality info in redux
        console.debug("#### HomeComponent - set municipalityInfo", municipalityInfo, activeMunicipalityInfo);
        dispatch(setActiveMunicipalityInfo(municipalityInfo));
      })();
    }, [currentLatLng]);
  
    // Do things in municipality if municipality is given by URL
    // useEffect(() => {
    //   if(url_municipality === undefined) {
    //     return;
    //   }

    //   // Handle navigation to municipality/municipalitypage when given in the URL
    //   (async () => {
    //     console.debug("#### HomeComponent - Getting municipality based on urlName", url_municipality);

    //     const municipality_differs = (activeMunicipalityInfo === undefined && url_municipality !== undefined) || (activeMunicipalityInfo !== undefined && url_municipality !== activeMunicipalityInfo?.UrlName);
    //     const article_differs = (activeArticleTitle !== "" && url_municipalitypage !== undefined) || (activeArticleTitle !== "" && url_municipalitypage !== activeArticleTitle);

    //     if(municipality_differs || article_differs) {
    //       console.debug("#### HomeComponent - URL differs from active municipality + page, updating URL");
    //       updateUrl("municipality", url_municipality);
    //     }

    //     if(url_municipality === undefined) {
    //         return;
    //     }

    //     // Get url_municipality
    //     const info = await getMunicipalityBasedOnUrlName(url_municipality);
    //     if (!info) return;

    //     // Fly to url_municipality, on the map
    //     const initialLatLng = convertCoordinatenToCoords(
    //       info.Coordinaten,
    //     );
    //     if (initialLatLng) {
    //         dispatch(setInitialLatLng(initialLatLng));
    //     }
    //     // Set url_municipality info in redux
    //     // dispatch(setActiveMunicipality(url_municipality));
    //     dispatch(setActiveMunicipalityInfo(info));
    //     dispatch(setActiveArticleTitle(url_municipalitypage || ""));
    //     })();
    // }, []);
  
    const renderDesktopParkingList = () => {
      return (
        <div
        className={`
          l-0
          _bottom-0
          absolute
          top-0
          z-10
          w-full
          p-4
          sm:top-16
          sm:w-auto
        `}
      >
        {/*
        <div
          data-comment="Spacer - Show only on desktop"
          className="
            hidden h-16
            w-full sm:block
          "
        ></div>
        */}

        <div
          data-comment="Parkings list - Show only on desktop"
          className="
            hidden sm:inline-block
          "
          style={{
            width: "414px",
            height: "auto",
          }}
          // height: mapZoom >= 12 ? "60vh" : 'auto',
          // maxHeight: 'calc(100vh - 64px)'
        >
          <ParkingFacilityBrowser
            showSearchBar={true}
            fietsenstallingen={fietsenstallingen}
            onShowStallingDetails={(id: string | undefined) => {
              updateStallingId(id);
            }}
          />
        </div>

        <div
          data-comment="Mobile topbar - Show only on mobile"
          className="
            fixed left-5
            right-3
            top-3
            flex
            sm:hidden
          "
        >
          <Link
            href={`/${
              activeMunicipalityInfo
                ? activeMunicipalityInfo.UrlName !== "fietsberaad"
                  ? activeMunicipalityInfo.UrlName
                  : ""
                : ""
            }`}
            onClick={() => {
              dispatch(setIsParkingListVisible(false));
            }}
            className="mr-3 block"
          >
            <Logo
              imageUrl={
                mapZoom >= 12 &&
                activeMunicipalityInfo &&
                activeMunicipalityInfo.CompanyLogo2
                  ? `https://static.veiligstallen.nl/library/logo2/${activeMunicipalityInfo.CompanyLogo2}`
                  : undefined
              }
            />
          </Link>
          <SearchBar
            filterChanged={(e: { target: { value: any } }) => {
              dispatch(setQuery(e.target.value));
              dispatch(setIsParkingListVisible(true));
            }}
            afterHtml={
              <ToggleMenuIcon
                className="
                absolute
                right-1
                z-10
                bg-transparent
                shadow-none
              "
                onClick={() => {
                  dispatch(setIsMobileNavigationVisible(true));
                }}
              />
            }
          />
          {/*HAMB.*/}
        </div>
      </div>)
    }

    const renderDesktopFloatingButtons = (isCardListVisible: boolean, showArticlesBox: boolean) => {
      return (
        <div
        data-comment="Floating buttons: Filter & Toggle buttons"
        className={`
          absolute
          ${isCardListVisible ? "bottom-44" : "bottom-5"}
          z-10
          block
          w-full
          sm:hidden
        `}
      >
        <div
          data-comment="Floating button: Toggle filter"
          className="
            absolute bottom-0
            right-0
            mx-5
            w-1/6
            text-right
          "
        >
          <IconButton
            className="
              relative z-20 mb-5
            "
            iconUrl={
              isParkingListVisible
                ? `/images/icon-map.png`
                : `https://cdn3.iconfinder.com/data/icons/feather-5/24/list-256.png`
            }
            onClick={() => {
              dispatch(setIsParkingListVisible(!isParkingListVisible));
              // dispatch(setIsFilterBoxVisible(false));
            }}
          ></IconButton>

          <IconButton
            className="
              relative z-20 mb-0
            "
            iconUrl={
              "https://cdn2.iconfinder.com/data/icons/user-interface-line-38/24/Untitled-5-21-256.png"
            }
            onClick={() => {
              dispatch(setIsFilterBoxVisible(!isFilterBoxVisible));
              // dispatch(setIsParkingListVisible(false));
            }}
          ></IconButton>

          {/*Overlays on same level as icon buttons,
             so we can show icon buttons above overlays
          */}
          {isFilterBoxVisible && (
            <div
              data-comment="Filter overlay - Show only on mobile"
              className="
              fixed bottom-0 left-0
              z-20
              block
              h-full
              w-full
              sm:hidden
            "
            >
              <div
                className="
              absolute
              bottom-0
              left-0
              right-0
              top-0
            "
                style={{
                  backgroundColor: "rgba(0, 0, 0, 0.5)",
                }}
                onClick={() => {
                  dispatch(setIsFilterBoxVisible(false));
                }}
              />
              <div
                className="
              absolute
              bottom-0
              rounded-3xl
              rounded-b-none
              bg-white
              p-4
              text-left
              shadow-lg
            "
              >
                <FilterBox filterArticles={showArticlesBox === true} showFilterAanmeldingen={(session && session.user) ? true : false} />
              </div>
            </div>
          )}
          <div
            data-comment="Parking list overlay - Show only on mobile"
            className="
              fixed
              bottom-0 left-0
              z-10
              block
              w-full
              sm:hidden
            "
          >
            {isParkingListVisible && (
              <Overlay>
                <ParkingFacilityBrowser
                  showSearchBar={false}
                  fietsenstallingen={fietsenstallingen}
                  onShowStallingDetails={(id: any) => {
                    updateStallingId(id);
                  }}
                />
              </Overlay>
            )}
          </div>
        </div>
      </div>)
    }
    
    const renderArticlesBox = (municipality: string, page: string, isSm: boolean) => {
      return (
        <div className="absolute sm:left-1/4 left-0 md:w-1/2 sm:w-2/3 w-full top-20 h-auto z-20">
          <ArticleComponent
              municipality={municipality}
              page={page}
              fietsenstallingen={fietsenstallingen}
              isSm={isSm}
              onFilterChange={(info) => {console.log("#### HomeComponent - onFilterChange", info)}}
            />
        </div>
      )
    }

    const updateUrl = (to: string, path?: string) => {
      console.debug("#### HomeComponent - updateUrl", to, path);

      // If activeParkingId is set: Don't update URL
      if (activeParkingId) return;

      // Determine the desired URL
      let desiredUrl = "/";
      if (to === "municipality" && path) {
        // municipality given in path
        desiredUrl = `/${path}`;
      } else if (to === "article" && path) {
        // municipality + article given in path
        desiredUrl = `/${path}`;
      }

      // Check if the current URL matches the desired URL
      if (window.location.pathname !== desiredUrl) {
        window.history.pushState({}, "", desiredUrl);
      } else {
        console.debug("#### HomeComponent - updateUrl - no change in URL");
      }
    };
  
    const isSm = typeof window !== "undefined" && window.innerWidth < 640;
    // const isLg = typeof window !== "undefined" && window.innerWidth < 768;
  
    const isCardListVisible = !isParkingListVisible && !isFilterBoxVisible;
  
    if (online === false) {
      return (
        <>
          <main className="flex-grow">
            <h1>Database offline {message} </h1>
          </main>
        </>
      );
    }
  
    const updateStallingId = (id: string | undefined): void => {
      if (undefined === id) {
        delete query.stallingid;
        router.push({ query: { ...query } });
      } else {
        router.push({ query: { ...query, stallingid: id } });
      }
  
      if (activeParkingId !== id) {
        dispatch(setActiveParkingId(id));
      }
    };
  
    const handleCloseParking = () => {
      if (router.query.stallingid !== undefined) {
        delete query.stallingid;
        router.push({ query: { ...query } });
      }
      dispatch(setActiveParkingId(undefined));
    };
  
    const handleStallingAanmelden = async () => {
      const newID = await createNewStalling(session as Session, currentLatLong);
      dispatch(setActiveParkingId(newID));
    };

    const showArticlesBox = activeArticleMunicipality !== undefined && activeArticleTitle !== undefined;
    // console.debug("@@@@ HomeComponent - showArticlesBox", showArticlesBox, activeArticleMunicipality, activeArticleTitle);

    let filteredFietsenstallingen: any[] = [];
    if (fietsenstallingen) {
      const showNew = activeTypes2 && activeTypes2.includes("show_submissions");
      const aFilter = (x: any) => (showNew ? (x.Status === "new") : (x.Status !== "new"));
      filteredFietsenstallingen = fietsenstallingen.filter(aFilter);
    }
  
    return (
      <>
        <main className="flex-grow">
          <AppHeader onStallingAanmelden={handleStallingAanmelden} showGemeenteMenu={mapZoom > 12} />
  
          {activeParkingId !== undefined && (
            <Parking
              id={"parking-modal"}
              stallingId={activeParkingId}
              fietsenstallingen={fietsenstallingen}
              onStallingIdChanged={newId => {
                updateStallingId(newId);
              }}
              onClose={handleCloseParking}
            />
          )}

          {showArticlesBox && (
            renderArticlesBox(activeArticleMunicipality, activeArticleTitle, isSm)
          )}

          { renderDesktopParkingList() }

          { renderDesktopFloatingButtons(isCardListVisible, showArticlesBox) }
      
          {isCardListVisible && (
            <div
              data-comment="Parkings cards - Show only on mobile"
              className="
              absolute bottom-9
              z-10
              block
              w-full
              sm:hidden
            "
            >
              <CardList
                fietsenstallingen={fietsenstallingen}
                onShowStallingDetails={(id: any) => {
                  updateStallingId(id);
                }}
              />
            </div>
          )}
  
          {/* <ParkingFacilities fietsenstallingen={fietsenstallingen} onStallingAamelden={handleStallingAanmelden}/> */}
          <div data-name="parking-facilities">
            <div className="flex flex-col items-center justify-center">
                <MapboxMap fietsenstallingen={filteredFietsenstallingen} />
            </div>

            <div data-comment="Show only on desktop" className="hidden sm:flex">
              <div
                className="absolute right-0 z-10 p-4"
                style={{top: "64px"}}
              >
                <FilterBox filterArticles={false} showFilterAanmeldingen={true}/>
              </div>
              <FooterNav onStallingAanmelden={handleStallingAanmelden} />
            </div>
          </div>
        </main>
  
        {isMobileNavigationVisible && (
          <>
            <Modal
              onClose={() => {
                dispatch(setIsMobileNavigationVisible(false));
              }}
              clickOutsideClosesDialog={false}
            >
              <AppNavigationMobile
                mapZoom={mapZoom}
                activeMunicipalityInfo={activeMunicipalityInfo}
              />
            </Modal>
          </>
        )}

        <InfomodalComponent />
      </>
    );
  };
  
  export default HomeComponent;