import React from 'react';
import {
  FiBarChart2,
  FiDownload,
  FiFileText,
  FiHelpCircle,
  FiHome,
  FiMapPin,
  FiSettings,
  FiUsers,
} from 'react-icons/fi';
import { useRouter } from 'next/router';

import { type VSUserSecurityProfile, VSSecurityTopic } from '~/types/securityprofile';
import { VSMenuTopic } from '~/types/';
import { userHasRight } from '~/types/utils';
interface LeftMenuGemeenteProps {
  securityProfile?: VSUserSecurityProfile;
  activecomponent: VSMenuTopic | undefined;
  onSelect: (component: VSMenuTopic) => void;
  hasAbonnementenModule: boolean;
}

import { LeftMenuItem } from './LeftMenuCommon';

const LeftMenuGemeente: React.FC<LeftMenuGemeenteProps> = ({
  securityProfile,
  activecomponent,
  onSelect,
  hasAbonnementenModule,
}) => {
  const router = useRouter();
  const isOnReportPage = router.pathname.startsWith('/beheer/report');
  const currentChartType = router.query.chartType as string | undefined;

  const hasGebruikersDataeigenaarAdmin = userHasRight(securityProfile, VSSecurityTopic.gebruikers_dataeigenaar_admin);
  const hasGebruikersDataeigenaarBeperkt = userHasRight(securityProfile, VSSecurityTopic.gebruikers_dataeigenaar_beperkt);
  const hasInstellingenDataeigenaar = userHasRight(securityProfile, VSSecurityTopic.instellingen_dataeigenaar);
  const hasAbonnementsvormen = userHasRight(securityProfile, VSSecurityTopic.abonnementsvormen_beheerrecht);
  const hasInstellingenSiteContentPages = userHasRight(securityProfile, VSSecurityTopic.instellingen_site_content_pages);
  const hasInstellingenSiteContentFaq = userHasRight(securityProfile, VSSecurityTopic.instellingen_site_content_faq);
  const hasInstellingenFietsenstallingenAdmin = userHasRight(securityProfile, VSSecurityTopic.instellingen_fietsenstallingen_admin);
  const hasInstellingenFietsenstallingenBeperkt = userHasRight(securityProfile, VSSecurityTopic.instellingen_fietsenstallingen_beperkt);
  const hasRapportages = userHasRight(securityProfile, VSSecurityTopic.rapportages);

  const handleReportClick = () => {
    router.push('/beheer/report/afgeronde-transacties');
  };

  const reportTypes = [
    { slug: 'afgeronde-transacties', title: 'Afgeronde transacties' },
    { slug: 'procentuele-bezetting', title: 'Procentuele bezetting' },
    { slug: 'absolute-bezetting', title: 'Absolute bezetting' },
    { slug: 'stallingsduur', title: 'Stallingsduur' },
  ];

  return (
    <nav
      id="leftMenu"
      className="h-[calc(100vh-64px)] shrink-0 overflow-y-auto border-r border-gray-200 bg-white px-5 py-6"
      aria-label="Hoofdmenu"
    >
      <ul className="space-y-1">
        <LeftMenuItem
          component={VSMenuTopic.Home}
          title={'Home'}
          activecomponent={activecomponent}
          onSelect={onSelect}
          icon={FiHome}
        />

        {hasInstellingenDataeigenaar && (
          <LeftMenuItem
            component={VSMenuTopic.SettingsGemeente}
            title={'Instellingen'}
            activecomponent={activecomponent}
            onSelect={onSelect}
            icon={FiSettings}
          />
        )}

        {(hasGebruikersDataeigenaarAdmin || hasGebruikersDataeigenaarBeperkt) && (
          <LeftMenuItem
            component={VSMenuTopic.UsersGebruikersbeheerGemeente}
            title={'Gebruikers'}
            activecomponent={activecomponent}
            onSelect={onSelect}
            icon={FiUsers}
          />
        )}

        {(hasInstellingenFietsenstallingenAdmin || hasInstellingenFietsenstallingenBeperkt) && (
          <LeftMenuItem
            component={VSMenuTopic.Fietsenstallingen}
            title={'Fietsenstallingen'}
            activecomponent={activecomponent}
            onSelect={onSelect}
            icon={FiMapPin}
          />
        )}

        {hasAbonnementsvormen && hasAbonnementenModule && (
          <LeftMenuItem
            component={VSMenuTopic.Abonnementsvormen}
            title={'Abonnementsvormen'}
            activecomponent={activecomponent}
            onSelect={onSelect}
            icon={FiFileText}
          />
        )}

        {hasInstellingenSiteContentPages && (
          <LeftMenuItem
            component={VSMenuTopic.ArticlesPages}
            title={"Pagina's"}
            compact={true}
            activecomponent={activecomponent}
            onSelect={onSelect}
            icon={FiFileText}
          />
        )}

        {hasInstellingenSiteContentFaq && (
          <LeftMenuItem
            component={VSMenuTopic.Faq}
            title={'FAQ'}
            compact={true}
            activecomponent={activecomponent}
            onSelect={onSelect}
            icon={FiHelpCircle}
          />
        )}

        {hasRapportages && (
          <>
            <LeftMenuItem
              component={VSMenuTopic.Report}
              title={'Rapportage'}
              compact={true}
              activecomponent={activecomponent}
              onSelect={onSelect}
              onClick={handleReportClick}
              icon={FiBarChart2}
            >
              {isOnReportPage && (
                <ul className="ml-4 mt-1 space-y-1">
                  {reportTypes.map((report) => {
                    const isActive = currentChartType === report.slug;
                    return (
                      <li key={report.slug}>
                        <button
                          type="button"
                          onClick={() => router.push(`/beheer/report/${report.slug}`)}
                          className={`font-poppinsmedium flex items-center gap-3 rounded-lg px-3 py-1.5 text-sm transition-colors ${
                            isActive
                              ? "bg-sky-50 text-sky-700 shadow-inner border border-sky-100"
                              : "text-gray-700 hover:bg-gray-100"
                          }`}
                        >
                          <span className="truncate">{report.title}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </LeftMenuItem>
            <LeftMenuItem
              component={VSMenuTopic.Export}
              title={'Export'}
              compact={true}
              activecomponent={activecomponent}
              onSelect={onSelect}
              icon={FiDownload}
            />
          </>
        )}
      </ul>
    </nav>
  );
}

export default LeftMenuGemeente;