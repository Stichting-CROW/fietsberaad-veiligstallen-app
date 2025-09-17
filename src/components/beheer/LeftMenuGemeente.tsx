import React from 'react';

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
  const hasExploitantenToegangsrecht = userHasRight(securityProfile, VSSecurityTopic.exploitanten_toegangsrecht);
  const hasGebruikersDataeigenaarAdmin = userHasRight(securityProfile, VSSecurityTopic.gebruikers_dataeigenaar_admin);
  const hasGebruikersDataeigenaarBeperkt = userHasRight(securityProfile, VSSecurityTopic.gebruikers_dataeigenaar_beperkt);
  const hasInstellingenDataeigenaar = userHasRight(securityProfile, VSSecurityTopic.instellingen_dataeigenaar);
  const hasInstellingenSiteContent = userHasRight(securityProfile, VSSecurityTopic.instellingen_site_content);
  const hasInstellingenFietsenstallingenAdmin = userHasRight(securityProfile, VSSecurityTopic.instellingen_fietsenstallingen_admin);
  const hasInstellingenFietsenstallingenBeperkt = userHasRight(securityProfile, VSSecurityTopic.instellingen_fietsenstallingen_beperkt);
  const hasRapportages = userHasRight(securityProfile, VSSecurityTopic.rapportages);

  return (
    <ul id="leftMenu" className="shadow w-64 min-h-screen p-4">
      <>
        <LeftMenuItem 
          component={VSMenuTopic.Home} 
          title={'Home'} 
          activecomponent={activecomponent} 
          onSelect={onSelect} />

        { hasInstellingenDataeigenaar && 
            <LeftMenuItem 
              component={VSMenuTopic.SettingsGemeente} 
              title={'Instellingen'} activecomponent={activecomponent} 
              onSelect={onSelect} /> }

        { (hasGebruikersDataeigenaarAdmin || hasGebruikersDataeigenaarBeperkt) && 
            <LeftMenuItem 
              component={VSMenuTopic.UsersGebruikersbeheerGemeente} 
              title={'Gebruikers'} activecomponent={activecomponent} 
              onSelect={onSelect} /> }
        {/* { (hasExploitantenToegangsrecht) && 
            <LeftMenuItem 
              component={VSMenuTopic.ContactsExploitanten} 
              title={'Exploitanten'} 
              activecomponent={activecomponent} 
              onSelect={onSelect} /> } */}
            {/* <LeftMenuItem 
              component={VSMenuTopic.ContactsDataproviders} 
              title={'Dataleveranciers'} 
              activecomponent={activecomponent} 
              onSelect={onSelect} /> */}

        { (hasInstellingenFietsenstallingenAdmin || hasInstellingenFietsenstallingenBeperkt) && 
            <LeftMenuItem 
              component={VSMenuTopic.Fietsenstallingen} 
              title={'Fietsenstallingen'} 
              activecomponent={activecomponent} 
              onSelect={onSelect} />
        }

        {hasInstellingenSiteContent && 
          <>
            <LeftMenuItem 
              component={VSMenuTopic.ArticlesPages} 
              title={'Pagina\'s'} compact={true} 
              activecomponent={activecomponent} 
              onSelect={onSelect} /> 
            <LeftMenuItem 
              component={VSMenuTopic.Faq} 
              title={'FAQ'} 
              compact={true} 
              activecomponent={activecomponent} 
              onSelect={onSelect} /> 
          </>
        }

        {hasRapportages && 
          <>
            <LeftMenuItem 
              component={VSMenuTopic.Report} 
              title={'Rapportage'} 
              compact={true} 
              activecomponent={activecomponent} 
              onSelect={onSelect} /> 
            <LeftMenuItem 
              component={VSMenuTopic.Export} 
              title={'Export'} 
              compact={true} 
              activecomponent={activecomponent} 
              onSelect={onSelect} />
          </>
        }
      </>
    </ul>
  );
}

export default LeftMenuGemeente;