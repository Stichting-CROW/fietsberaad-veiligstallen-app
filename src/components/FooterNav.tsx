// @ts-nocheck
import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react"
import { useDispatch, useSelector } from "react-redux";
import { type AppState } from "~/store/store";
import { setActiveArticle } from "~/store/appSlice";
import { VSArticle } from "~/types/articles";

import {
  getArticlesForMunicipality,
  filterNavItems,
  getFooter
} from "~/utils/navigation";

const FooterNavItem = ({
  url,
  children,
  className
}: {
  url?: string,
  children: any,
  className?: string,
}) => {
  const { push } = useRouter();

  return <a href={url} className={`
    ${className}
    mx-2
  `}
    onClick={(e) => {
      e.preventDefault();

      push(url);
    }}
  >
    {children}
  </a>
}

const FooterNavItemClick = ({
  onClick,
  children,
  className
}: {
  url?: string,
  children: any,
  className?: string,
}) => {
  return <div className={`
    ${className}
    mx-2
  `}
    onClick={onClick}
  >
    {children}
  </div>
}

const FooterNav = ({ onStallingAanmelden, children }: {
  onStallingAanmelden?: () => void,
  children?: any
}) => {
  const { data: session } = useSession()

  const [fietsberaadArticles, setFietsberaadArticles] = useState([]);

  const mapZoom = useSelector((state: AppState) => (state.map).zoom);

  // Get menu items for siteId 1 (Fietsberaad)
  useEffect(() => {
    (async () => {
      const response = await getArticlesForMunicipality(1);
      setFietsberaadArticles(response);
    })();
  }, []);

  const navItemsPrimary = [
    // { title: 'Stalling toevoegen' },
    { title: 'Over VeiligStallen', url: '/fietsberaad/Copyright' },
  ];

  const footerMenuItems = getFooter(fietsberaadArticles);

  return (
    <div className="
      fixed
      bottom-0
      right-0
      bg-white
      py-3
      px-2
      rounded-t-xl
      flex
      text-xs
      z-10
    ">
      {!session && mapZoom >= 12 ?
        <FooterNavItemClick
          onClick={() => { onStallingAanmelden && onStallingAanmelden() }}
          className="cursor-pointer font-bold">
          Stalling aanmelden
        </FooterNavItemClick> : null}

      {navItemsPrimary.map(x => <FooterNavItem
        key={x.title}
        url={x.url}
        className="font-bold"
      >
        {x.title}
      </FooterNavItem>)}

      {footerMenuItems ? footerMenuItems.map((x, idx) => <FooterNavItem
        key={'pmi-f-' + idx}
        url={`/fietsberaad/${x.Title ? x.Title : ''}`}
      >
        {x.DisplayTitle ? x.DisplayTitle : (x.Title ? x.Title : '')}
      </FooterNavItem>) : ''}

      <FooterNavItem
        url="https://github.com/Stichting-CROW/fietsberaad-veiligstallen-app/blob/main/RELEASES.md#app-updates-veiligstallen"
      >
        <small className="text-xs text-gray-400">v2026-01-07</small>
      </FooterNavItem>

    </div>
  );
}

const FooterNav_overlay = ({ onStallingAanmelden, children }: {
  onStallingAanmelden?: () => void,
  children?: any
}) => {
  const { data: session } = useSession()
  const dispatch = useDispatch();
  const [fietsberaadArticles, setFietsberaadArticles] = useState([]);

  // Get menu items for siteId 1 (Fietsberaad)
  useEffect(() => {
    (async () => {
      const response = await getArticlesForMunicipality("1");
      setFietsberaadArticles(filterNavItems(response));
    })();
  }, []);

  const navItemsPrimary = [
    // { title: 'Stalling toevoegen' },
    { displayTitle: 'Over VeiligStallen',   // text in menu
      municipality: 'fietsberaad',
      Title: 'Copyright' // title in URL
    },
  ];

  const footerMenuItems = getFooter(fietsberaadArticles);

  return (
    <div className="
      fixed
      bottom-0
      right-0
      bg-white
      py-3
      px-2
      rounded-t-xl
      flex
      text-xs
      z-10
    ">
      {!session ?
        <FooterNavItemClick
          onClick={() => { onStallingAanmelden && onStallingAanmelden() }}
          className="cursor-pointer font-bold">
          Stalling aanmelden
        </FooterNavItemClick> : null}

      {navItemsPrimary.map(x => <FooterNavItemClick 
        key={x.title}
        onClick={() => {
          dispatch(setActiveArticle({
            articleTitle: x.Title,
            municipality: x.Municipality
          }));
        }}
        className="font-bold"
      >
        {x.displayTitle}
      </FooterNavItemClick>)}

      {footerMenuItems ? footerMenuItems.map((x, idx) => <FooterNavItemClick
        key={'pmi-f-' + idx}
        onClick={() => {
          dispatch(setActiveArticle({
            articleTitle: x.Title,
            municipality: x.Municipality
          }));
        }}
      >
        {x.DisplayTitle ? x.DisplayTitle : (x.Title ? x.Title : '')}
      </FooterNavItemClick>) : ''}
    </div>
  );
}

export default FooterNav;
