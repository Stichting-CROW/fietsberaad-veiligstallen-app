// LeftMenuFietsberaad.tsx
import React from 'react';
import { useRouter } from 'next/router';
import {
  FiBriefcase,
  FiCheckSquare,
  FiClock,
  FiDownload,
  FiEdit2,
  FiFileText,
  FiGrid,
  FiHelpCircle,
  FiHome,
  FiMail,
  FiMap,
  FiMapPin,
  FiServer,
  FiSettings,
  FiTag,
  FiUsers,
} from 'react-icons/fi';

import { VSSecurityTopic, type VSUserSecurityProfile } from '~/types/securityprofile';
import { VSMenuTopic } from '~/types/';

import { userHasRight } from '~/types/utils';
interface LeftMenuFietsberaadProps {
  securityProfile?: VSUserSecurityProfile;
  activecomponent: VSMenuTopic | undefined;
  onSelect: (component: VSMenuTopic) => void;
}

import { LeftMenuItem } from './LeftMenuCommon';

const LeftMenuFietsberaad: React.FC<LeftMenuFietsberaadProps> = ({
  securityProfile,
  activecomponent,
  onSelect,
}) => {
  const router = useRouter();

  const hasFietsberaadSuperadmin = userHasRight(securityProfile, VSSecurityTopic.fietsberaad_superadmin);
  const hasFietsberaadAdmin = userHasRight(securityProfile, VSSecurityTopic.fietsberaad_admin);
  const hasAcceptatieOntwikkeling = userHasRight(securityProfile, VSSecurityTopic.acceptatie_ontwikkeling);
  const hasWachtrijAccess = false && userHasRight(securityProfile, VSSecurityTopic.wachtrij);

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

        {hasFietsberaadSuperadmin && (
          <LeftMenuItem
            component={VSMenuTopic.UsersGebruikersbeheerFietsberaad}
            title={`Gebruikers`}
            compact={true}
            activecomponent={activecomponent}
            onSelect={onSelect}
            icon={FiUsers}
          />
        )}

        {hasFietsberaadSuperadmin && (
          <LeftMenuItem
            component={false}
            title={'Organisaties'}
            activecomponent={activecomponent}
            onSelect={onSelect}
          >
            <>
              <LeftMenuItem
                component={VSMenuTopic.ContactsGemeenten}
                title={'Data-eigenaren'}
                compact={true}
                activecomponent={activecomponent}
                onSelect={onSelect}
                icon={FiMapPin}
              />
              <LeftMenuItem
                component={VSMenuTopic.ContactsExploitanten}
                title={'Exploitanten'}
                compact={true}
                activecomponent={activecomponent}
                onSelect={onSelect}
                icon={FiBriefcase}
              />
              <LeftMenuItem
                component={VSMenuTopic.ContactsDataproviders}
                title={'Dataleveranciers'}
                compact={true}
                activecomponent={activecomponent}
                onSelect={onSelect}
                icon={FiServer}
              />
            </>
          </LeftMenuItem>
        )}

        {hasFietsberaadSuperadmin && (
          <LeftMenuItem
            component={false}
            title={'Contactpersonen'}
            activecomponent={activecomponent}
            onSelect={onSelect}
          >
            <>
              <LeftMenuItem
                component={VSMenuTopic.Contactpersonen}
                title={'Mail contactpersonen'}
                compact={true}
                activecomponent={activecomponent}
                onSelect={onSelect}
                onClick={() => router.push('/beheer/contactpersonen/mail-contactpersonen')}
                isActive={router.asPath.includes('/beheer/contactpersonen/mail-contactpersonen')}
                icon={FiMail}
              />
              <LeftMenuItem
                component={VSMenuTopic.Contactpersonen}
                title={'Bewerk mailsjabloon'}
                compact={true}
                activecomponent={activecomponent}
                onSelect={onSelect}
                onClick={() => router.push('/beheer/contactpersonen/mailsjabloon')}
                isActive={router.asPath.includes('/beheer/contactpersonen/mailsjabloon')}
                icon={FiEdit2}
              />
              <LeftMenuItem
                component={VSMenuTopic.Contactpersonen}
                title={'Mailfrequentie'}
                compact={true}
                activecomponent={activecomponent}
                onSelect={onSelect}
                onClick={() => router.push('/beheer/contactpersonen/mailfrequentie-contactpersonen')}
                isActive={router.asPath.includes('/beheer/contactpersonen/mailfrequentie-contactpersonen')}
                icon={FiMail}
              />
              <LeftMenuItem
                component={VSMenuTopic.Contactpersonen}
                title={'Datakwaliteit-controles'}
                compact={true}
                activecomponent={activecomponent}
                onSelect={onSelect}
                onClick={() => router.push('/beheer/contactpersonen/datakwaliteitcontroles')}
                isActive={router.asPath.includes('/beheer/contactpersonen/datakwaliteitcontroles')}
                icon={FiCheckSquare}
              />
            </>
          </LeftMenuItem>
        )}

        {(hasFietsberaadAdmin || hasFietsberaadSuperadmin) && (
          <LeftMenuItem
            component={false}
            title={'Website beheer'}
            activecomponent={activecomponent}
            onSelect={onSelect}
          >
            <>
              <LeftMenuItem
                component={VSMenuTopic.ArticlesPages}
                title={"Pagina's"}
                compact={true}
                activecomponent={activecomponent}
                onSelect={onSelect}
                icon={FiFileText}
              />
              <LeftMenuItem
                component={VSMenuTopic.Faq}
                title={'FAQ'}
                compact={true}
                activecomponent={activecomponent}
                onSelect={onSelect}
                icon={FiHelpCircle}
              />
            </>
          </LeftMenuItem>
        )}

        {(hasFietsberaadAdmin || hasFietsberaadSuperadmin) && (
          <LeftMenuItem
            component={false}
            title={'Uitgifte barcodes'}
            activecomponent={activecomponent}
            onSelect={onSelect}
          >
            <>
              <LeftMenuItem
                component={VSMenuTopic.BarcodereeksenSleutelhangers}
                title={'Sleutelhangers'}
                compact={true}
                activecomponent={activecomponent}
                onSelect={onSelect}
                icon={FiTag}
              />
              <LeftMenuItem
                component={VSMenuTopic.BarcodereeksenFietsstickers}
                title={'Fietsstickers'}
                compact={true}
                activecomponent={activecomponent}
                onSelect={onSelect}
                icon={FiTag}
              />
            </>
          </LeftMenuItem>
        )}

        {(hasFietsberaadAdmin || hasFietsberaadSuperadmin) && (
          <LeftMenuItem
            component={false}
            title={'Database'}
            activecomponent={activecomponent}
            onSelect={onSelect}
          >
            <>
              {hasFietsberaadSuperadmin && (
                <LeftMenuItem
                  component={VSMenuTopic.Database}
                  title={'Beheer'}
                  compact={true}
                  activecomponent={activecomponent}
                  onSelect={onSelect}
                  icon={FiSettings}
                />
              )}
              <LeftMenuItem
                component={VSMenuTopic.Tariefcodes}
                title={'Tariefcodes'}
                compact={true}
                activecomponent={activecomponent}
                onSelect={onSelect}
                icon={FiTag}
              />
              <LeftMenuItem
                component={VSMenuTopic.DatabaseExport}
                title={'Export'}
                compact={true}
                activecomponent={activecomponent}
                onSelect={onSelect}
                icon={FiDownload}
              />
              <LeftMenuItem
                component={VSMenuTopic.DatabaseModules}
                title={'Modules'}
                compact={true}
                activecomponent={activecomponent}
                onSelect={onSelect}
                icon={FiGrid}
              />
            </>
          </LeftMenuItem>
        )}

        {hasFietsberaadSuperadmin && hasAcceptatieOntwikkeling && (
          <LeftMenuItem
            component={false}
            title={'Ontwikkeling'}
            activecomponent={activecomponent}
            onSelect={onSelect}
          >
            <>
              <LeftMenuItem
                component={VSMenuTopic.ExploreGemeenten}
                title={'Gemeenten'}
                compact={true}
                activecomponent={activecomponent}
                onSelect={onSelect}
                icon={FiMap}
              />
              <LeftMenuItem
                component={VSMenuTopic.ExploreUsers}
                title={'Gebruikers'}
                compact={true}
                activecomponent={activecomponent}
                onSelect={onSelect}
                icon={FiUsers}
              />
              {hasWachtrijAccess && (
                <LeftMenuItem
                  component={VSMenuTopic.Wachtrij}
                  title={'Wachtrij'}
                  compact={true}
                  activecomponent={activecomponent}
                  onSelect={onSelect}
                  icon={FiClock}
                />
              )}
              {/* <LeftMenuItem component={VSMenuTopic.ExploreUsersColdfusion} title={'Gebruikers (Oude structuur)'} compact={true} activecomponent={activecomponent} onSelect={onSelect} /> */}
              {/* <LeftMenuItem component={VSMenuTopic.TestDatabaseApi} title={'Test Database API'} compact={true} activecomponent={activecomponent} onSelect={onSelect} /> */}
              {/* <LeftMenuItem
                component={VSMenuTopic.Fietsenstallingen}
                title={'Fietsenstallingen'}
                activecomponent={activecomponent}
                onSelect={onSelect}
                icon={FiMapPin}
              /> */}
            </>
          </LeftMenuItem>
        )}
      </ul>
    </nav>
  );
}

export default LeftMenuFietsberaad;
