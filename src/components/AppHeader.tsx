import React, { useState, useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { usePathname, useRouter } from 'next/navigation';
import { type AppState } from "~/store/store";
import AppHeaderDesktop from "~/components/AppHeaderDesktop";
import AppHeaderMobile from "~/components/AppHeaderMobile";

import {
  getArticlesForMunicipality,
  // getNavigationItemsForMunicipality,
  filterNavItems,
  getPrimary,
  getSecondary,
} from "~/utils/navigation";

import type { VSArticle } from "~/types/articles";

function AppHeader({
  onStallingAanmelden,
  showGemeenteMenu = false
}: {
  onStallingAanmelden?: () => void,
  showGemeenteMenu?: boolean
}) {
  const pathName = usePathname();
  const router = useRouter();
  const [articlesMunicipality, setArticlesMunicipality] = useState<VSArticle[]>([]);
  const [articlesFietsberaad, setArticlesFietsberaad] = useState<VSArticle[]>([]);

  const activeMunicipalityInfo = useSelector(
    (state: AppState) => (state.map).activeMunicipalityInfo
  );

  const mapZoom = useSelector((state: AppState) => (state.map).zoom);

  // Get menu items based on active municipality
  useEffect(() => {
    (async () => {
      const response = await getArticlesForMunicipality(activeMunicipalityInfo?.ID||"1");
      setArticlesMunicipality(filterNavItems(response));
    })().catch(err => {
      console.error("getArticlesForMunicipality error", err);
    });
  }, [
    activeMunicipalityInfo,
    pathName,
    mapZoom
  ]);

  useEffect(() => {
    (async () => {
      const response = await getArticlesForMunicipality("1");
      setArticlesFietsberaad(filterNavItems(response));
    })().catch(err => {
      console.error("getArticlesForMunicipality error", err);
    });
  }, [
    activeMunicipalityInfo,
    pathName,
    mapZoom
  ]);

  const primaryMenuItems = getPrimary(articlesMunicipality, articlesFietsberaad, showGemeenteMenu);
  const secundaryMenuItems = getSecondary(articlesMunicipality, articlesFietsberaad, showGemeenteMenu);

  // Check if we're on the home page (root path)
  const isHomePage = pathName === '/' || pathName === '' || pathName.split('/').length === 2 && pathName.split('/').length === 2;

  return (
    <>
      <div
        data-comment="Show only on desktop"
        className={`
          hidden
          sm:flex
        `}
      >
        <AppHeaderDesktop 
          onStallingAanmelden={onStallingAanmelden} 
          activeMunicipalityInfo={activeMunicipalityInfo} 
          primaryMenuItems={primaryMenuItems} 
          secundaryMenuItems={secundaryMenuItems} />
      </div>

      {! isHomePage && <div
        data-comment="Show on mobile, on non-home pages"
        className={`
          block
          sm:hidden
        `}
      >
        <AppHeaderMobile hideLogo={false} handleCloseClick={() => {
          router.push('/');
        }} />
      </div>}
    </>
  );
}

export default AppHeader;
