// LeftMenu.tsx
import React from 'react';
import Link from 'next/link';

import { VSSecurityTopic, VSMenuTopic, VSUserSecurityProfile } from '~/types/index';
import { VSModuleValues } from '~/types/modules';
import { type VSContactDataprovider, VSContactExploitant, type VSContactGemeente } from '~/types/contacts';
import { VSUserRoleValuesNew } from '~/types/users';

import { userHasRight, userHasModule, userHasRole } from '~/types/utils';
interface LeftMenuProps {
  securityProfile?: VSUserSecurityProfile;
  activecomponent: VSMenuTopic | undefined;
  onSelect: (component: VSMenuTopic) => void;
}

const LeftMenu: React.FC<LeftMenuProps> = ({
  securityProfile,
  activecomponent,
  onSelect,
}) => {
  // const router = useRouter();
  // const { query } = router;

  const formatLi = (component: VSMenuTopic | false, title: string, compact: boolean = false, children?: React.ReactNode) => {
    const isSelected = component === activecomponent;
    const className = `block px-4 py-2 rounded ${isSelected ? "font-bold" : "hover:bg-gray-200"}`;
    const style = isSelected ? { backgroundColor: 'rgba(31, 153, 210, 0.1)' } : {};
    const classNamePassive = `block px-4 py-2 rounded`;

    return (
      <li className={compact ? 'mb-2' : 'mb-1'}>
        {component ? (
          <Link href="#" onClick={(e) => { e.preventDefault(); onSelect(component) }} className={className} style={style}>
            {title}
          </Link>
        ) : (
          <Link href="#" onClick={(e) => { e.preventDefault() }} className={classNamePassive} style={style}>
            {title}
          </Link>
        )}
        {children}
      </li>
    );
  }

  const formatLiDevelopment = (component: VSMenuTopic | false, title: string, compact: boolean = false, children?: React.ReactNode) => {
    const isSelected = component === activecomponent;
    const className = `block px-4 py-2 rounded ${isSelected ? "font-bold" : "hover:bg-gray-200"}`;
    const style = isSelected ? { backgroundColor: 'rgba(31, 153, 210, 0.1)' } : {};
    const classNamePassive = `block px-4 py-2 rounded strikethrough`;

    return (
      <li className={compact ? 'mb-2' : 'mb-1'}>
        {component ? (
          <Link href="#" onClick={(e) => { e.preventDefault(); onSelect(component) }} className={className} style={style}>
            <span className="line-through">{title}</span>
          </Link>
        ) : (
          <Link href="#" onClick={(e) => { e.preventDefault() }} className={classNamePassive} style={style}>
            <span className="line-through">{title}</span>
          </Link>
        )}
        {children}
      </li>
    );
  }



  const renderUnifiedMenu = () => {
    // Base conditions from user security profile
    const profile = securityProfile;

    // Role-based conditions
    const isAdmin = userHasRole(profile, VSUserRoleValuesNew.RootAdmin) || userHasRole(profile, VSUserRoleValuesNew.Admin);

    const hasSystemRight = userHasRight(profile, VSSecurityTopic.System);
    const hasWebsiteRight = userHasRight(profile, VSSecurityTopic.Website);
    const hasGemeenteRight = userHasRight(profile, VSSecurityTopic.ContactsGemeenten);
    const hasLocatiesRight = userHasRight(profile, VSSecurityTopic.ApisGekoppeldeLocaties);
    const hasBuurtstallingenRight = userHasRight(profile, VSSecurityTopic.Buurtstallingen) && userHasModule(profile, VSModuleValues.Buurtstallingen);
    const hasRegistrantenRight = userHasRight(profile, VSSecurityTopic.Accounts) && userHasModule(profile, VSModuleValues.Fms);
    const hasRapportagesRight = userHasRight(profile, VSSecurityTopic.Report) && userHasModule(profile, VSModuleValues.Fms);
    const hasUsersRight = userHasRight(profile, VSSecurityTopic.UsersGebruikersbeheer) && userHasModule(profile, VSModuleValues.Fms);
    const hasDataprovidersRight = userHasRight(profile, VSSecurityTopic.ContactsDataproviders) && userHasModule(profile, VSModuleValues.Fms);
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
        {formatLi(VSMenuTopic.Home, 'Home')}

        {hasInstellingenRight && formatLi(VSMenuTopic.SettingsGemeente, 'Instellingen')}

        {hasUsersRight && formatLi(VSMenuTopic.UsersGebruikersbeheerFietsberaad, `Gebruikers`, true)}

        { formatLi(false, 'Organisaties', false,
          <ul className="ml-4 mt-1">
            {(isAdmin || hasGemeenteRight) && formatLi(VSMenuTopic.ContactsGemeenten, 'Gemeenten')}
            { hasSystemRight && isAdmin && formatLi(VSMenuTopic.ContactsExploitanten, 'Exploitanten')}
            { hasSystemRight && isAdmin && hasDataprovidersRight && formatLi(VSMenuTopic.ContactsDataproviders, 'Dataleveranciers')}
            {!hasSystemRight && hasDataprovidersRight && formatLi(VSMenuTopic.ContactsDataproviders, 'Toegang fmsservice')}
          </ul>) }
  
        {!hasSystemRight && hasRegistrantenRight && formatLi(VSMenuTopic.Accounts, 'Registranten')}
  
        {/* {hasLocatiesRight && formatLi(VSMenuTopic.Fietsenstallingen, 'Fietsenstallingen')}
        {hasBuurtstallingenRight && formatLi(VSMenuTopic.Buurtstallingen, 'Buurtstallingen / Fietstrommels')} */}

  
        {hasRapportagesRight && 
          formatLi(false, 'Rapportages', false,
            <ul className="ml-4 mt-1">
              {formatLi(VSMenuTopic.Report, 'Rapportage', true)}
              {formatLi(VSMenuTopic.Export, 'Export', true)}
              {formatLiDevelopment(VSMenuTopic.Logboek, 'Logboek', true)}
            </ul>
          )
        }

        {hasSystemRight && hasExternalApisRight && (
          formatLi(false, 'Externe API\'s', false,
            <ul className="ml-4 mt-1">
              {formatLiDevelopment(VSMenuTopic.ApisOverzicht, 'Overzicht API\'s', true)}
              {formatLiDevelopment(VSMenuTopic.ApisGekoppeldeLocaties, 'Gekoppelde locaties', true)}
            </ul>
          )
        )}
  
        {(hasWebsiteRight) && 
          formatLi(VSMenuTopic.Website, 'Website beheer', false,
            <ul className="ml-4 mt-1">
              {formatLi(VSMenuTopic.ArticlesPages, 'Paginabeheer', true)}
              {formatLiDevelopment(VSMenuTopic.Faq, 'FAQ', true)}
            </ul>
          )
        }

        {hasDatabaseRight && formatLi(VSMenuTopic.Database, 'Database')}

        { hasDevelopmentRight && (
            formatLi(false, 'Ontwikkeling', false,
              <ul className="ml-4 mt-1">
                {formatLi(VSMenuTopic.ExploreGemeenten, 'Gemeenten', true)}
                {formatLi(VSMenuTopic.ExploreExploitanten, 'Exploitanten', true)}
                {formatLi(VSMenuTopic.ExploreUsers, 'Gebruikers', true)}
                {formatLi(VSMenuTopic.ExploreLeftMenu, 'Test Hoofdmenu', true)}
                {formatLi(VSMenuTopic.TestDatabaseApi, 'Test Database API', true)}
              </ul>)
            )
        }
      </>
    )
  }
  
  // for now, only show the temporary production menu in production
  const isProduction = process.env.NODE_ENV === 'production';
  if(isProduction) {
    return (
      <ul id="leftMenu" className="shadow w-64 min-h-screen p-4">
        {formatLi(VSMenuTopic.Report, 'Rapportages', true)}
      </ul>
    )
  }
  
  return (
    <ul id="leftMenu" className="shadow w-64 min-h-screen p-4">
      {isProduction ? (
        formatLi(VSMenuTopic.Report, 'Rapportages', true)
      ) : (
        renderUnifiedMenu()
      )}
    </ul>
  );
}

export default LeftMenu;
