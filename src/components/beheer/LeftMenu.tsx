// LeftMenu.tsx
import React from 'react';
import Link from 'next/link';

import { VSSecurityTopic, type VSUserSecurityProfile } from '~/types/securityprofile';
import { VSMenuTopic } from '~/types/';
import { VSUserRoleValuesNew } from '~/types/users';

import { userHasRight, userHasRole } from '~/types/utils';
interface LeftMenuProps {
  securityProfile?: VSUserSecurityProfile;
  activecomponent: VSMenuTopic | undefined;
  onSelect: (component: VSMenuTopic) => void;
}

import { LeftMenuItem } from './LeftMenuCommon';

const LeftMenu: React.FC<LeftMenuProps> = ({
  securityProfile,
  activecomponent,
  onSelect,
}) => {
  // const router = useRouter();
  // const { query } = router;

  // Do only show reports? Temporary for testing, 2025-05
  const doOnlyShowReports = (): boolean => {
    return !['veiligstallen.work', 'localhost:3000'].includes(window?.location?.host);
  }

  const renderUnifiedMenu = () => {
    // Base conditions from user security profile
    const profile = securityProfile;

    // Role-based conditions
    const isAdmin = userHasRole(profile, VSUserRoleValuesNew.RootAdmin) || userHasRole(profile, VSUserRoleValuesNew.Admin);

    const hasSystemRight = userHasRight(profile, VSSecurityTopic.System);
    const hasWebsiteRight = userHasRight(profile, VSSecurityTopic.Website);
    const hasGemeenteRight = userHasRight(profile, VSSecurityTopic.ContactsGemeenten);
    // const hasLocatiesRight = userHasRight(profile, VSSecurityTopic.ApisGekoppeldeLocaties);
    // const hasBuurtstallingenRight = userHasRight(profile, VSSecurityTopic.Buurtstallingen) // && userHasModule(profile, VSModuleValues.Buurtstallingen);
    const hasRegistrantenRight = userHasRight(profile, VSSecurityTopic.Accounts) // && userHasModule(profile, VSModuleValues.Fms);
    const hasRapportagesRight = userHasRight(profile, VSSecurityTopic.Report) // && userHasModule(profile, VSModuleValues.Fms);
    const hasUsersRight = userHasRight(profile, VSSecurityTopic.UsersGebruikersbeheer) // && userHasModule(profile, VSModuleValues.Fms);
    const hasDataprovidersRight = userHasRight(profile, VSSecurityTopic.ContactsDataproviders) // && userHasModule(profile, VSModuleValues.Fms);
    const hasExternalApisRight = userHasRight(profile, VSSecurityTopic.ApisOverzicht);
    const hasDevelopmentRight = userHasRight(profile, VSSecurityTopic.Development);

    const hasDatabaseRight = hasSystemRight;

    const hasInstellingenRight = isAdmin;

    {/* TODO: Later terugzetten, nu niet nodig
      // const hasFietskluizenRight = userHasRight(profile, VSSecurityTopic.Fietskluizen);
      // const hasAbonnementenRight = userHasRight(profile, VSSecurityTopic.Abonnementen);
      // const hasDiashowRight = userHasRight(profile, VSSecurityTopic.Presentations);
      // const hasUsersBeheerdersRight = userHasRight(profile, VSSecurityTopic.UsersBeheerders);
      // const hasSleutelhangerreeksenRight = userHasRight(profile, VSSecurityTopic.BarcodereeksenSleutelhangers);
      // const hasDocumentenModule = userHasRight(profile, VSSecurityTopic.Documents);

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
          {hasUsersRight && <LeftMenuItem component={VSMenuTopic.UsersGebruikersbeheerFietsberaad} title={`Gebruikers`} compact={true} activecomponent={activecomponent} onSelect={onSelect} />}

          { <LeftMenuItem component={false} title={'Organisaties'} compact={false} activecomponent={activecomponent} onSelect={onSelect}>
              <ul className="ml-4 mt-1">
                {(isAdmin || hasGemeenteRight) && <LeftMenuItem component={VSMenuTopic.ContactsGemeenten} title={'Data-eigenaren'} activecomponent={activecomponent} onSelect={onSelect} />}
                { hasSystemRight && isAdmin && <LeftMenuItem component={VSMenuTopic.ContactsExploitanten} title={'Exploitanten'} activecomponent={activecomponent} onSelect={onSelect} />}
                { hasSystemRight && isAdmin && hasDataprovidersRight && <LeftMenuItem component={VSMenuTopic.ContactsDataproviders} title={'Dataleveranciers'} activecomponent={activecomponent} onSelect={onSelect} />}
                {!hasSystemRight && hasDataprovidersRight && <LeftMenuItem component={VSMenuTopic.ContactsDataproviders} title={'Toegang fmsservice'} activecomponent={activecomponent} onSelect={onSelect} />}
              </ul>
            </LeftMenuItem> }

          {!hasSystemRight && hasRegistrantenRight && <LeftMenuItem component={VSMenuTopic.Accounts} title={'Registranten'} activecomponent={activecomponent} onSelect={onSelect} />}

          {/* {hasLocatiesRight && formatLi(VSMenuTopic.Fietsenstallingen, 'Fietsenstallingen')}
          {hasBuurtstallingenRight && formatLi(VSMenuTopic.Buurtstallingen, 'Buurtstallingen / Fietstrommels')} */}

          {hasRapportagesRight && 
            <LeftMenuItem component={false} title={'Rapportages'} compact={false} activecomponent={activecomponent} onSelect={onSelect}>
              <ul className="ml-4 mt-1">
                <LeftMenuItem component={VSMenuTopic.Report} title={'Rapportage'} compact={true} activecomponent={activecomponent} onSelect={onSelect} />
                <LeftMenuItem component={VSMenuTopic.Export} title={'Export'} compact={true} activecomponent={activecomponent} onSelect={onSelect} />
                {/* {formatLiDevelopment(VSMenuTopic.Logboek, 'Logboek', true)} */}
              </ul>
            </LeftMenuItem>
          }

          {(hasWebsiteRight) && 
            <LeftMenuItem component={false} title={'Website beheer'} compact={false} activecomponent={activecomponent} onSelect={onSelect}>
              <ul className="ml-4 mt-1">
                <LeftMenuItem component={VSMenuTopic.ArticlesPages} title={'Pagina\'s'} compact={true} activecomponent={activecomponent} onSelect={onSelect} />
                <LeftMenuItem component={VSMenuTopic.Faq} title={'FAQ'} compact={true} activecomponent={activecomponent} onSelect={onSelect} />
              </ul>
            </LeftMenuItem>
          }

          {hasDatabaseRight && <LeftMenuItem component={VSMenuTopic.Database} title={'Database'} activecomponent={activecomponent} onSelect={onSelect} />}

          { hasDevelopmentRight && <>
            <LeftMenuItem component={false} title={'Ontwikkeling'} compact={false} activecomponent={activecomponent} onSelect={onSelect}>
              <ul className="ml-4 mt-1">
                <LeftMenuItem component={VSMenuTopic.ExploreGemeenten} title={'Gemeenten'} compact={true} activecomponent={activecomponent} onSelect={onSelect} />
                <LeftMenuItem component={VSMenuTopic.ExploreUsers} title={'Gebruikers'} compact={true} activecomponent={activecomponent} onSelect={onSelect} />
                <LeftMenuItem component={VSMenuTopic.ExploreUsersColdfusion} title={'Gebruikers (Oude structuur)'} compact={true} activecomponent={activecomponent} onSelect={onSelect} />
                <LeftMenuItem component={VSMenuTopic.ExplorePages} title={`Pagina's`} compact={true} activecomponent={activecomponent} onSelect={onSelect} />
                <LeftMenuItem component={VSMenuTopic.TestDatabaseApi} title={'Test Database API'} compact={true} activecomponent={activecomponent} onSelect={onSelect} />
              </ul>
            </LeftMenuItem>
          </>}
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
    <ul id="leftMenu" className="shadow w-64 h-[calc(100vh-64px)] overflow-y-auto p-4">
      {renderUnifiedMenu()}
    </ul>
  );
}

export default LeftMenu;
