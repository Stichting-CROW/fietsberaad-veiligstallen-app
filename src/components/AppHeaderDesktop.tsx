import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useRouter } from "next/navigation";
import { useSession, signOut } from "next-auth/react"
import Link from 'next/link'
import { type AppState } from "~/store/store";
import { setActiveArticle } from "~/store/appSlice";
import Logo from './Logo';
import { ToggleMenuIcon } from "~/components/ToggleMenuIcon";
import ImageWithFallback from "~/components/common/ImageWithFallback";

import {
  setIsMobileNavigationVisible
} from "~/store/appSlice";

import { PrimaryMenuItem, SecundaryMenuItem } from "~/components/MenuItems";
import { type VSContactGemeente } from "~/types/contacts";
import { type VSArticle } from "~/types/articles";

function AppHeaderDesktop({
  activeMunicipalityInfo,
  primaryMenuItems,
  secundaryMenuItems,
  onStallingAanmelden,
}: {
  activeMunicipalityInfo: VSContactGemeente | undefined,
  primaryMenuItems: VSArticle[] | undefined,
  secundaryMenuItems: VSArticle[] | undefined,
  onStallingAanmelden?: () => void,
}) {
  const dispatch = useDispatch();
  const router = useRouter();
  const { data: session } = useSession()

  const [didNavOverflow, setDidNavOverflow] = useState(false);

  // const isAuthenticated = useSelector(
  //   (state: AppState) => state.auth.authState
  // );

  const mapZoom = useSelector((state: AppState) => state.map.zoom) || 12;

  const articlemunicipality = useSelector((state: AppState) => (state.app).activeArticleMunicipality);
  const articlepage = useSelector((state: AppState) => (state.app).activeArticleTitle);
  
  // Handler if screen size changes
  useEffect(() => {
    // Run at least once
    overflowNavItems();
    // Set event handler
    window.addEventListener('resize', overflowNavItems);
    return () => {
      window.removeEventListener('resize', overflowNavItems);
    };
  }, [
    primaryMenuItems,
    secundaryMenuItems
  ]);

  function overflowNavItems(): void {
    // In AppHeaderDesktop, check if nav items overflow
    const headerEl = document.getElementsByClassName('AppHeaderDesktop')[0] as HTMLElement;
    const wrapperEl = document.getElementsByClassName('primaryMenuItems-wrapper')[0] as HTMLElement;
    // Show nav items again after resize
    for (const el of wrapperEl.children) {
      (el as HTMLElement).style.display = 'block';
    }
    // Check if nav items overflow the nav bar
    let navOverflow = false;
    for (const el of wrapperEl.children) {
      if (!(el as HTMLElement).classList.contains('PrimaryMenuItem')) {
        continue;
      }
      const elementTop = (el as HTMLElement).offsetTop;
      const headerHeight = headerEl.offsetHeight;
      if ((elementTop + 12) >= headerHeight) {// 12 = padding-top of header
        (el as HTMLElement).style.display = 'none';
        navOverflow = true;
      } else {
        (el as HTMLElement).style.display = 'block';
      }
    }
    setDidNavOverflow(navOverflow);
  }

  const handleNieuweStallingClick = () => {
    if (onStallingAanmelden) {
      onStallingAanmelden();
    }
  }

  const handleLoginClick = () => {
    if (!session) {
      router.push('/login');
    } else {
      // sign out
      if(confirm('Wil je uitloggen?')) {
        signOut().catch(err => {
          console.error("signOut error", err);
        });
      }
    }
  };

  const themeColor1 = mapZoom >= 12 && activeMunicipalityInfo && activeMunicipalityInfo.ThemeColor1
    ? `#${activeMunicipalityInfo.ThemeColor1}`
    : '#15aeef';

  const themeColor2 = mapZoom >= 12 && activeMunicipalityInfo && activeMunicipalityInfo.ThemeColor1
    ? `#${activeMunicipalityInfo.ThemeColor2}`
    : '#15aeef';

  const showMapIcon = articlepage!=='';

  const showStallingAanmaken = false; //  session && mapZoom >= 12 && activeMunicipalityInfo;

  const renderLogo = () => {
    const activecontact = activeMunicipalityInfo;

    // If logo URL starts with http, return the image
    if(activecontact?.CompanyLogo && activecontact?.CompanyLogo.indexOf('http') === 0) {
      return <img src={activecontact?.CompanyLogo} className="max-h-full w-auto bg-white mr-2" />
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
        className="max-h-full w-auto bg-white mr-2"
      />
    }

    return <img src="https://fms.veiligstallen.nl/resources/client/logo.png" className="max-h-full w-auto bg-white mr-2" />
  }

  return (
    <>
      <div
        className="
          AppHeaderDesktop
          t-0
          fixed z-10
          flex
          w-full
          justify-between
          px-5
          py-3
          bg-white

          overflow-hidden
        "
        style={{ height: '64px' }}
      >
        <Link
          href={`/${activeMunicipalityInfo && activeMunicipalityInfo.UrlName ? (activeMunicipalityInfo.UrlName !== 'fietsberaad' ? activeMunicipalityInfo.UrlName : '') : ''}`}
          className="flex flex-col justify-center"
        >
          {renderLogo()}
        </Link>
        <div className={`
          primaryMenuItems-wrapper
          relative
          flex-1 flex flex-start
          flex-wrap overflow-hidden
          transition-opacity
          duration-500
          ${(primaryMenuItems && primaryMenuItems.length > 0) ? 'opacity-100' : 'opacity-0'}
        `}>
          {showMapIcon && <PrimaryMenuItem
            key={'pmi-h1-map'}
            icon={'/images/icon-map.png'}
            targetmunicipality={articlemunicipality}
            targetpage={articlepage}
            title={''}
            url={'/'}
          />}
          {primaryMenuItems ? primaryMenuItems.map((x: VSArticle, idx: number) => <PrimaryMenuItem
            key={`pmi-h1-${idx}`}
            targetmunicipality={x.SiteID}
            targetpage={x.Title}
            title={x.DisplayTitle ? x.DisplayTitle : x.Title}
            url={`/${(mapZoom >= 12 && activeMunicipalityInfo) && activeMunicipalityInfo.UrlName ? activeMunicipalityInfo.UrlName : 'fietsberaad'}/${x.Title ? x.Title : ''}`}
          />) : ''}
          <div className="
          " style={{
              display: didNavOverflow ? 'block' : 'none',
              visibility: didNavOverflow ? 'visible' : 'hidden',
            }}>
            <ToggleMenuIcon className="
              shadow-none
              bg-transparent
              z-10
            "
              style={{ height: '40px' }}
              onClick={() => {
                dispatch(setIsMobileNavigationVisible(true))
              }}
            />
          </div>
        </div>
        <div className="flex flex-end">
          {secundaryMenuItems && secundaryMenuItems.map((x: VSArticle, idx: number) => {
            let url = `/${(mapZoom >= 12 && activeMunicipalityInfo) && activeMunicipalityInfo.UrlName ? activeMunicipalityInfo.UrlName : 'fietsberaad'}/${x.Title ? x.Title : ''}`

            return <SecundaryMenuItem
              key={`pmi-h2-${idx}`}
              targetmunicipality={x.SiteID}
              targetpage={x.Title}
              title={x.DisplayTitle}
              url={url}
              onClick={() => {
                dispatch(setActiveArticle({
                  articleTitle: x.Title || "",
                  municipality: ""
                }));
              }}  
            />
          })}

          {showStallingAanmaken ?
            <button
              className="
                mx-2
                h-10
                rounded-md
                px-4
                font-bold
                text-white
                shadow-lg
              "
              style={{
                backgroundColor: themeColor1,
              }}
              onClick={handleNieuweStallingClick}
            >
              {"Stalling aanmelden"}
            </button> : null
          }

          {session && <Link
            href="/beheer"
            onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
              e.preventDefault();
              router.push('/beheer');
            }}
            className="
              mx-2
              h-10
              rounded-md
              px-4
              font-bold
              text-white
              shadow-lg
              flex
              flex-col
              justify-center
            "
            style={{
              backgroundColor: themeColor1,
            }}

            title="Ga naar het beheer"
          >
            Beheer
          </Link>}

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
    </>
  );
}

export default AppHeaderDesktop;
