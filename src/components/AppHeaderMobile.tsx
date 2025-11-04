import * as React from "react";
import { useDispatch, useSelector } from "react-redux";
import { type AppState } from "~/store/store";
import Link from 'next/link'
import Image from 'next/image'
import ImageWithFallback from "~/components/common/ImageWithFallback";

// Import components
import Modal from "src/components/Modal";
import AppNavigationMobile from "~/components/AppNavigationMobile";

import {
  setIsMobileNavigationVisible
} from "~/store/appSlice";

// Import components
import Logo from './Logo';
import PageTitle from "~/components/PageTitle";

function AppHeaderMobile({
  title,
  handleCloseClick,
  children,
  hideLogo = false
}: {
  title?: string,
  handleCloseClick?: () => void,
  children?: React.ReactNode,
  hideLogo?: boolean
}) {
  const dispatch = useDispatch();

  const activeMunicipalityInfo = useSelector(
    (state: AppState) => state.map.activeMunicipalityInfo
  );

  const isMobileNavigationVisible = useSelector(
    (state: AppState) => state.app.isMobileNavigationVisible
  );

  const mapZoom = useSelector((state: AppState) => state.map.zoom) || 12;

  const renderLogo = () => {
    // Don't render logo if hideLogo is true
    if (hideLogo) {
      return null;
    }

    const activecontact = activeMunicipalityInfo;

    // If logo URL starts with http, return the image
    if(activecontact?.CompanyLogo && activecontact?.CompanyLogo.indexOf('http') === 0) {
      return <img src={activecontact?.CompanyLogo} className="max-h-12 w-auto bg-white" />
    }

    let logofile ="https://fms.veiligstallen.nl/resources/client/logo.png";

    // If logo URL is not null and mapZoom is 12 or higher, return the image
    if(mapZoom >= 12 && activecontact?.CompanyLogo && activecontact?.CompanyLogo !== null) {
      logofile = activecontact.CompanyLogo;
      if(!logofile.startsWith('http')) {
          logofile =logofile.replace('[local]', '/api')
          if(!logofile.startsWith('/')) {
            logofile = '/' + logofile;
          }
      }

      return <ImageWithFallback
        src={logofile}
        fallbackSrc="https://fms.veiligstallen.nl/resources/client/logo.png"
        alt="Logo"
        width={64}
        height={64}
        className="max-h-12 w-auto bg-white"
      />
    }

    return <img src="https://fms.veiligstallen.nl/resources/client/logo.png" className="max-h-12 w-auto bg-white mr-2" />
  }

  return (
    <>
      <div
        className="
          z-10
          
          w-full
          
          bg-white

          overflow-hidden
          sticky
          top-0

          sm:h-auto

          shadow
        "
        style={{
          height: '72px'
        }}
      >
        <div className="
          py-3
          px-5
          flex
          justify-between
        ">
          <div className="flex flex-col justify-center">
            <Link href={`/${activeMunicipalityInfo && activeMunicipalityInfo.UrlName ? (activeMunicipalityInfo.UrlName !== 'fietsberaad' ? activeMunicipalityInfo.UrlName : '') : ''}`}>
              {renderLogo()}
            </Link>
          </div>

          <div className="
            text-sm
            text-center
            flex-1
            flex
            flex-col
            justify-center
          " style={{
            color: `#${activeMunicipalityInfo?.ThemeColor1}`,
            visibility: (activeMunicipalityInfo && mapZoom >= 12) ? 'visible' : 'hidden'
          }}>
            Welkom in {activeMunicipalityInfo?.CompanyName}
          </div>

          {/* Close button that shows on pages */}
          {handleCloseClick && <a href="#" onClick={() => {
            // Custom set action
            if (handleCloseClick) handleCloseClick();
            // Or default action
            else dispatch(setIsMobileNavigationVisible(true));
          }} className="
            overlay-close-button
            mt-4
            mr-2
          "
          >
            <Image
              src={(handleCloseClick) ? `/images/icon-close.png` : `/images/icon-hamburger.png`}
              alt={(handleCloseClick) ? `Sluiten` : 'Open menu'} 
              width={24}
              height={24}
              className="w-6" />
          </a>}
        </div>
      </div>

      {children}

      {isMobileNavigationVisible && (<>
        <Modal
          onClose={() => {
            dispatch(setIsMobileNavigationVisible(false))
          }}
          clickOutsideClosesDialog={false}
        >
          <AppNavigationMobile
            mapZoom={mapZoom}
            activeMunicipalityInfo={activeMunicipalityInfo}
          />
        </Modal>
      </>)}

    </>
  );
}

export default AppHeaderMobile;
