// LeftMenuGemeente.tsx
import React from 'react';
import Link from 'next/link';

import { type VSUserSecurityProfile, VSSecurityTopic } from '~/types/securityprofile';
import { VSMenuTopic } from '~/types/';
import { VSUserRoleValuesNew } from '~/types/users';

import { userHasRight, userHasRole } from '~/types/utils';
interface LeftMenuGemeenteProps {
  securityProfile?: VSUserSecurityProfile;
  activecomponent: VSMenuTopic | undefined;
  onSelect: (component: VSMenuTopic) => void;
}

const LeftMenuGemeente: React.FC<LeftMenuGemeenteProps> = ({
  securityProfile,
  activecomponent,
  onSelect,
}) => {
  // const router = useRouter();
  // const { query } = router;

  const formatLi = (component: VSMenuTopic | false, title: string, compact = false, children?: React.ReactNode) => {
    const isSelected = component === activecomponent;
    const className = `block px-4 py-2 rounded ${isSelected ? "font-bold" : "hover:bg-gray-200"}`;
    const style = isSelected ? { backgroundColor: 'rgba(31, 153, 210, 0.1)' } : {};
    const classNamePassive = `block px-4 py-2 rounded cursor-default`;

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

  const formatLiDevelopment = (component: VSMenuTopic | false, title: string, compact = false, children?: React.ReactNode) => {
    const isSelected = component === activecomponent;
    const className = `block px-4 py-2 rounded ${isSelected ? "font-bold" : "hover:bg-gray-200"}`;
    const style = isSelected ? { backgroundColor: 'rgba(31, 153, 210, 0.1)' } : {};
    const classNamePassive = `block px-4 py-2 rounded strikethrough cursor-default`;

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

  // Do only show reports? Temporary for testing, 2025-05
  const doOnlyShowReports = (): boolean => {
    return !['veiligstallen.work', 'localhost:3000'].includes(window?.location?.host||'');
  }

  const renderUnifiedMenu = () => {
    // Base conditions from user security profile

    // Role-based conditions
    const isAdmin = userHasRole(securityProfile, VSUserRoleValuesNew.RootAdmin) || userHasRole(securityProfile, VSUserRoleValuesNew.Admin);

    // const hasSystemRight = userHasRight(securityProfile, VSSecurityTopic.System);
    const hasWebsiteRight = userHasRight(securityProfile, VSSecurityTopic.Website);
    // const hasGemeenteRight = userHasRight(securityProfile, VSSecurityTopic.ContactsGemeenten);
    const hasLocatiesRight = userHasRight(securityProfile, VSSecurityTopic.ApisGekoppeldeLocaties);
    const hasBuurtstallingenRight = userHasRight(securityProfile, VSSecurityTopic.Buurtstallingen) // && userHasModule(securityProfile, VSModuleValues.Buurtstallingen);
    // const hasRegistrantenRight = userHasRight(securityProfile, VSSecurityTopic.Accounts) && userHasModule(securityProfile, VSModuleValues.Fms);
    const hasRapportagesRight = userHasRight(securityProfile, VSSecurityTopic.Report) // && userHasModule(securityProfile, VSModuleValues.Fms);
    // const hasUsersRight = userHasRight(securityProfile, VSSecurityTopic.UsersGebruikersbeheer) // && userHasModule(securityProfile, VSModuleValues.Fms);
    // const hasDataprovidersRight = userHasRight(securityProfile, VSSecurityTopic.ContactsDataproviders) // && userHasModule(securityProfile, VSModuleValues.Fms);
    // const hasExternalApisRight = userHasRight(securityProfile, VSSecurityTopic.ApisOverzicht);
    // const hasDevelopmentRight = userHasRight(securityProfile, VSSecurityTopic.Development);

    // const hasDatabaseRight = hasSystemRight;
    // const hasInstellingenRight = hasSystemRight;

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
        {formatLi(VSMenuTopic.Home, 'Home')}

        {doOnlyShowReports() && <>
          {formatLi(VSMenuTopic.Report, 'Rapportages', true)}
        </>}

        {! doOnlyShowReports() && <>
          { isAdmin && formatLi(VSMenuTopic.SettingsGemeente, 'Instellingen')}

          { isAdmin && formatLi(VSMenuTopic.UsersGebruikersbeheerGemeente, `Gebruikers`)}
          { isAdmin && formatLi(VSMenuTopic.ContactsExploitanten, 'Exploitanten')}
          {/* { isAdmin && formatLi(VSMenuTopic.ContactsDataproviders, 'Dataleveranciers')}
    
          { hasRegistrantenRight && formatLi(VSMenuTopic.Accounts, 'Registranten')} */}
    
          { hasLocatiesRight && formatLi(VSMenuTopic.Fietsenstallingen, 'Fietsenstallingen')}
          { hasBuurtstallingenRight && formatLi(VSMenuTopic.Buurtstallingen, 'Buurtstallingen / Fietstrommels')}

          {hasWebsiteRight && formatLi(VSMenuTopic.ArticlesPages, 'Pagina\'s', true)}
          {hasWebsiteRight && formatLi(VSMenuTopic.Faq, 'FAQ', true)}

          {hasRapportagesRight && formatLi(VSMenuTopic.Report, 'Rapportage', true)}
          {hasRapportagesRight && formatLi(VSMenuTopic.Export, 'Export', true)}
          {/* {hasRapportagesRight && formatLiDevelopment(VSMenuTopic.Logboek, 'Logboek', true)} */}
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
