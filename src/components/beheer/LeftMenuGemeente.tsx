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
  // Do only show reports? Temporary for testing, 2025-05
  const doOnlyShowReports = (): boolean => {
    return !['veiligstallen.work', 'localhost:3000'].includes(window?.location?.host||'');
  }

  const renderUnifiedMenu = () => {
    // Base conditions from user security profile

    // Role-based conditions
    const isAdmin = userHasRole(securityProfile, VSUserRoleValuesNew.RootAdmin) || userHasRole(securityProfile, VSUserRoleValuesNew.Admin);

    // Security rights using exact VSSecurityTopic enum values
    const hasFietsberaadSuperadmin = userHasRight(securityProfile, VSSecurityTopic.fietsberaad_superadmin);
    const hasFietsberaadAdmin = userHasRight(securityProfile, VSSecurityTopic.fietsberaad_admin);
    const hasExploitantenToegangsrecht = userHasRight(securityProfile, VSSecurityTopic.exploitanten_toegangsrecht);
    const hasGebruikersDataeigenaarAdmin = userHasRight(securityProfile, VSSecurityTopic.gebruikers_dataeigenaar_admin);
    const hasGebruikersDataeigenaarBeperkt = userHasRight(securityProfile, VSSecurityTopic.gebruikers_dataeigenaar_beperkt);
    const hasInstellingenDataeigenaar = userHasRight(securityProfile, VSSecurityTopic.instellingen_dataeigenaar);
    const hasInstellingenSiteContent = userHasRight(securityProfile, VSSecurityTopic.instellingen_site_content);
    const hasInstellingenFietsenstallingenAdmin = userHasRight(securityProfile, VSSecurityTopic.instellingen_fietsenstallingen_admin);
    const hasInstellingenFietsenstallingenBeperkt = userHasRight(securityProfile, VSSecurityTopic.instellingen_fietsenstallingen_beperkt);
    const hasRapportages = userHasRight(securityProfile, VSSecurityTopic.rapportages);

    {/* TODO: Later terugzetten, nu niet nodig
      // const hasFietskluizenRight = userHasRight(securityProfile, VSSecurityTopic.Fietskluizen);
      // const hasAbonnementenRight = userHasRight(securityProfile, VSSecurityTopic.Abonnementen);
      // const hasDiashowRight = userHasRight(securityProfile, VSSecurityTopic.Presentations);
      // const hasUsersBeheerdersRight = userHasRight(securityProfile, VSSecurityTopic.UsersBeheerders);
      // const hasSleutelhangerreeksenRight = userHasRight(securityProfile, VSSecurityTopic.BarcodereeksenSleutelhangers);
      // const hasDocumentenModule = userHasRight(securityProfile, VSSecurityTopic.Documents);

      {formatLi(VSMenuTopic.Products, 'Opwaardeerproducten')} 

        {hasSystemRight && isAdmin && formatLi(VSMenuTopic.ContactsAdmin, 'Beheerders')}

        { hasSystemRight hasSleutelhangerreeksenRight && (
          formatLi(false, 'Barcodes', false,
            <ul className="ml-4 mt-1">
              {formatLi(VSMenuTopic.BarcodereeksenUitgifteBarcodes, 'Uitgifte Barcodes', true)}
              {formatLi(VSMenuTopic.BarcodereeksenSleutelhangers, 'Sleutelhangers', true)}
              {formatLi(VSMenuTopic.BarcodereeksenFietsstickers, 'Fietsstickers', true)}
            </ul>
          )
        )}

         {!hasSystemRight && (activecontact?.ID === '1' || (hasAbonnementenModule && hasAbonnementenRight)) && (
          formatLi(false, 'Abonnementen', false,
            <ul className="ml-4 mt-1">
              {formatLi(VSMenuTopic.Abonnementsvormen, 'Abonnementsvormen', true)}
              {formatLi(VSMenuTopic.Abonnementen, 'Abonnementen', true)}
            </ul>
          )
        )}

        {!hasSystemRight && hasDocumentenModule && formatLi(VSMenuTopic.Documents, 'Documenten')}

        {!hasSystemRight && hasDiashowRight && formatLi(VSMenuTopic.Presentations, 'Diashow')}  

        {hasFietskluizenModule && hasFietskluizenRight && formatLiDevelopment(VSMenuTopic.Fietskluizen, 'Status chipkluizen')}

    */}

    return (
      <>
        <LeftMenuItem component={VSMenuTopic.Home} title={'Home'} activecomponent={activecomponent} onSelect={onSelect} />

        {doOnlyShowReports() && <>
          <LeftMenuItem component={VSMenuTopic.Report} title={'Rapportages'} compact={true} activecomponent={activecomponent} onSelect={onSelect} />
        </>}

        {! doOnlyShowReports() && <>
          { isAdmin && <LeftMenuItem component={VSMenuTopic.SettingsGemeente} title={'Instellingen'} activecomponent={activecomponent} onSelect={onSelect} /> }

          { isAdmin && <LeftMenuItem component={VSMenuTopic.UsersGebruikersbeheerGemeente} title={'Gebruikers'} activecomponent={activecomponent} onSelect={onSelect} /> }
          { isAdmin && <LeftMenuItem component={VSMenuTopic.ContactsExploitanten} title={'Exploitanten'} activecomponent={activecomponent} onSelect={onSelect} /> }
          {/* { isAdmin && formatLi(VSMenuTopic.ContactsDataproviders, 'Dataleveranciers')}
    
          { hasRegistrantenRight && formatLi(VSMenuTopic.Accounts, 'Registranten')} */}
    
          { hasInstellingenFietsenstallingenAdmin && <LeftMenuItem component={VSMenuTopic.Fietsenstallingen} title={'Fietsenstallingen'} activecomponent={activecomponent} onSelect={onSelect} /> }

          {hasInstellingenSiteContent && <LeftMenuItem component={VSMenuTopic.ArticlesPages} title={'Pagina\'s'} compact={true} activecomponent={activecomponent} onSelect={onSelect} /> }
          {hasInstellingenSiteContent && <LeftMenuItem component={VSMenuTopic.Faq} title={'FAQ'} compact={true} activecomponent={activecomponent} onSelect={onSelect} /> }

          {hasRapportages && <LeftMenuItem component={VSMenuTopic.Report} title={'Rapportage'} compact={true} activecomponent={activecomponent} onSelect={onSelect} /> }
          {hasRapportages && <LeftMenuItem component={VSMenuTopic.Export} title={'Export'} compact={true} activecomponent={activecomponent} onSelect={onSelect} /> }
        </>}
      </>
    )
  }
  
  // for now, only show the temporary production menu in production
  // const isProduction = process.env.NODE_ENV === 'production';
  // if(isProduction) {
  //   return (
  //     <ul id="leftMenu" className="shadow w-64 min-h-screen p-4">
  //       {formatLi(VSMenuTopic.Report, 'Rapportages', true)}
  //     </ul>
  //   )
  // }
  
  return (
    <ul id="leftMenu" className="shadow w-64 min-h-screen p-4">
      {renderUnifiedMenu()}
    </ul>
  );
}

export default LeftMenuGemeente;
