import React, { useState, useEffect } from "react";
import { useSelector } from "react-redux";
import { usePathname } from 'next/navigation';
import { AppState } from "~/store/store";
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
import type { VSContactGemeente } from "~/types/contacts";

function AppHeader({
  onStallingAanmelden,
  showGemeenteMenu
}: {
  onStallingAanmelden?: () => void,
  showGemeenteMenu: boolean
}) {
  const pathName = usePathname();

  const [articlesMunicipality, setArticlesMunicipality] = useState<VSArticle[]>([]);
  const [articlesFietsberaad, setArticlesFietsberaad] = useState<VSArticle[]>([]);

  const activeMunicipalityInfo = useSelector(
    (state: AppState) => state.map.activeMunicipalityInfo as VSContactGemeente | undefined
  );

  const mapZoom = useSelector((state: AppState) => state.map.zoom);

  // Get menu items based on active municipality
  useEffect(() => {
    (async () => {
      const response = await getArticlesForMunicipality(activeMunicipalityInfo?.ID||"1");
      setArticlesMunicipality(filterNavItems(response));
    })();
  }, [
    activeMunicipalityInfo,
    pathName,
    mapZoom
  ]);

  useEffect(() => {
    (async () => {
      const response = await getArticlesForMunicipality("1");
      setArticlesFietsberaad(filterNavItems(response));
    })();
  }, [
    activeMunicipalityInfo,
    pathName,
    mapZoom
  ]);

  const primaryMenuItems = getPrimary(articlesMunicipality, articlesFietsberaad, showGemeenteMenu);
  const secundaryMenuItems = getSecondary(articlesMunicipality, articlesFietsberaad, showGemeenteMenu);

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

      <div
        data-comment="Show only on mobile OR if nav items don't fit"
        className={`
          block
          sm:hidden
        `}
      >
        <AppHeaderMobile />
      </div>
    </>
  );
}

export default AppHeader;
