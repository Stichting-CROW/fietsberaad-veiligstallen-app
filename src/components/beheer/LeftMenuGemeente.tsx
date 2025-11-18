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

import { type VSUserSecurityProfile, VSSecurityTopic } from '~/types/securityprofile';
import { VSMenuTopic } from '~/types/';
import { VSUserRoleValuesNew } from '~/types/users';

import { userHasRight, userHasRole } from '~/types/utils';
interface LeftMenuGemeenteProps {
  securityProfile?: VSUserSecurityProfile;
  activecomponent: VSMenuTopic | undefined;
  onSelect: (component: VSMenuTopic) => void;
}

import { LeftMenuItem } from './LeftMenuCommon';

const LeftMenuGemeente: React.FC<LeftMenuGemeenteProps> = ({
  securityProfile,
  activecomponent,
  onSelect,
}) => {
  const hasGebruikersDataeigenaarAdmin = userHasRight(securityProfile, VSSecurityTopic.gebruikers_dataeigenaar_admin);
  const hasGebruikersDataeigenaarBeperkt = userHasRight(securityProfile, VSSecurityTopic.gebruikers_dataeigenaar_beperkt);
  const hasInstellingenDataeigenaar = userHasRight(securityProfile, VSSecurityTopic.instellingen_dataeigenaar);
  const hasInstellingenSiteContentPages = userHasRight(securityProfile, VSSecurityTopic.instellingen_site_content_pages);
  const hasInstellingenSiteContentFaq = userHasRight(securityProfile, VSSecurityTopic.instellingen_site_content_faq);
  const hasInstellingenFietsenstallingenAdmin = userHasRight(securityProfile, VSSecurityTopic.instellingen_fietsenstallingen_admin);
  const hasInstellingenFietsenstallingenBeperkt = userHasRight(securityProfile, VSSecurityTopic.instellingen_fietsenstallingen_beperkt);
  const hasRapportages = userHasRight(securityProfile, VSSecurityTopic.rapportages);

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

        {hasInstellingenDataeigenaar && (
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
              icon={FiBarChart2}
            />
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