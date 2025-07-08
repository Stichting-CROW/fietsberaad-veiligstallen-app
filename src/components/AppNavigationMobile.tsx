import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useDispatch } from "react-redux";
import Image from 'next/image';

import { type VSArticle } from "~/types/articles";
import { type VSContactGemeente } from "~/types/contacts";

import {
  setIsMobileNavigationVisible,
  setIsParkingListVisible,
} from "~/store/appSlice";

import {
  // getNavigationItemsForMunicipality,
  getArticlesForMunicipality,
  filterNavItems,
  getPrimary,
  getSecondary,
  getFooter,
} from "~/utils/navigation";

import PageTitle from "~/components/PageTitle";

const NavSection = ({ children }: { children: any }) => {
  return (
    <div
      className="
		border-t-solid
		my-3
		border-t-2
		pb-0
		pt-3
	"
    >
      {children}
    </div>
  );
};

// If it has an icon: Show bold text
const NavItem = ({ title, icon, onClick }: { title: string, icon?: string, onClick: (e: React.MouseEvent<HTMLAnchorElement>) => void }) => {
  return (
    <a
      className={`
		my-2
		flex
		cursor-pointer
		text-lg
		${icon ? "font-bold" : ""}
	`}
      onClick={onClick}
    >
      {icon ? (
        <div className="flex flex-col justify-center">
          <Image
            src={`/images/${icon}`}
            alt={icon}
            width={16}
            height={16}
            className="mr-3 h-4 w-4"
          />
        </div>
      ) : (
        ""
      )}
      {title}
    </a>
  );
};

const AppNavigationMobile = ({
  activeMunicipalityInfo,
  mapZoom = 12,
}: {
  activeMunicipalityInfo?: VSContactGemeente;
  mapZoom?: number;
}) => {
  const router = useRouter();
  const dispatch = useDispatch();

  const [articlesMunicipality, setArticlesMunicipality] = useState<VSArticle[]>([]);
  const [articlesFietsberaad, setArticlesFietsberaad] = useState<VSArticle[]>([]);

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
    mapZoom
  ]);

  const clickItem = (url: string) => {
    // console.log("sure");
    dispatch(setIsMobileNavigationVisible(false));
    dispatch(setIsParkingListVisible(false));
    router.push(url);
  };

  const title =
    mapZoom >= 12 &&
      activeMunicipalityInfo &&
      activeMunicipalityInfo.CompanyName &&
      activeMunicipalityInfo.CompanyName !== 'FIETSBERAAD'
      ? `Welkom in ${activeMunicipalityInfo.CompanyName}`
      : `Welkom bij VeiligStallen`;

  const primaryMenuItems = getPrimary(articlesMunicipality, articlesFietsberaad, activeMunicipalityInfo!==undefined);
  const secundaryMenuItems = getSecondary(articlesMunicipality, articlesFietsberaad, activeMunicipalityInfo!==undefined);
  const footerMenuItems = getFooter(articlesFietsberaad);
  
  return (
    <div
      className="
			px-5
			py-8
		"
    >
      <header>
        <PageTitle
          className="
            mb-2 text-2xl text-red-600 max-w-[90%]
          "
        >
          {title}
        </PageTitle>
        <p
          className="max-w-[70%]"
        >
          De kortste weg naar een veilige plek voor je fiets{" "}
          {mapZoom >= 12 && activeMunicipalityInfo?.CompanyName ? `in ${activeMunicipalityInfo.CompanyName}` : ""}
        </p>
      </header>

      <nav>
        <NavSection>
          <NavItem
            title="Kaart"
            icon="icon-map.png"
            onClick={(e) => {
              e.preventDefault();

              clickItem("/");
            }}
          />
          <NavItem
            title="Lijst"
            icon="icon-list.png"
            onClick={(e) => {
              e.preventDefault();

              router.push("/");
              dispatch(setIsMobileNavigationVisible(false));
              dispatch(setIsParkingListVisible(true));
            }}
          />
        </NavSection>

        {/* Primary Nav Items */}
        {primaryMenuItems && primaryMenuItems.length > 0 && (
          <NavSection>
            {primaryMenuItems.map((x, xidx) => (
              <NavItem
                key={`pmi-${xidx}`}
                title={x.DisplayTitle ? x.DisplayTitle : x.Title ? x.Title : ""}
                onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                  e.preventDefault();
                  clickItem(
                    `/${mapZoom >= 12 && activeMunicipalityInfo && activeMunicipalityInfo.UrlName
                      ? activeMunicipalityInfo.UrlName
                      : "fietsberaad"
                    }/${x.Title ? x.Title : ""}`
                  );
                }}
              />
            ))}
          </NavSection>
        )}

        {/* Secundary Nav Items */}
        {secundaryMenuItems && secundaryMenuItems.length > 0 && (
          <NavSection>
            {secundaryMenuItems.map((x, xidx) => (
              <NavItem
                key={"pmi-" + xidx}
                title={x.DisplayTitle ? x.DisplayTitle : x.Title ? x.Title : ""}
                onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                  e.preventDefault();
                  clickItem(
                    `/${mapZoom >= 12 && activeMunicipalityInfo
                      ? activeMunicipalityInfo.UrlName
                      : "fietsberaad"
                    }/${x.Title ? x.Title : ""}`
                  );
                }}
              />
            ))}
          </NavSection>
        )}
        <NavSection>
          {/*<NavItem title="Over VeiligStallen" />*/}
          {footerMenuItems.map((x: VSArticle, xidx: number) => (
            <NavItem
              key={"pmi-" + xidx}
              title={x.DisplayTitle ? x.DisplayTitle : x.Title ? x.Title : ""}
              onClick={(e: React.MouseEvent<HTMLAnchorElement>) => {
                e.preventDefault();
                clickItem(`/fietsberaad/${x.Title ? x.Title : ""}`);
              }}
            />
          ))}
        </NavSection>
      </nav>
    </div>
  );
};

export default AppNavigationMobile;
