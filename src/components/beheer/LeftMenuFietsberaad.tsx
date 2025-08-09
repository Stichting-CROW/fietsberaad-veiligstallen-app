// LeftMenuFietsberaad.tsx
import React from 'react';
import Link from 'next/link';

import { VSSecurityTopic, type VSUserSecurityProfile } from '~/types/securityprofile';
import { VSMenuTopic } from '~/types/';
import { VSUserRoleValuesNew } from '~/types/users';

import { userHasRight, userHasRole } from '~/types/utils';
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
  // Do only show reports? Temporary for testing, 2025-05

  const hasFietsberaadSuperadmin = userHasRight(securityProfile, VSSecurityTopic.fietsberaad_superadmin);
  const hasFietsberaadAdmin = userHasRight(securityProfile, VSSecurityTopic.fietsberaad_admin);
  const hasAcceptatieOntwikkeling = userHasRight(securityProfile, VSSecurityTopic.acceptatie_ontwikkeling);

  return (
    <ul id="leftMenu" className="shadow w-64 h-[calc(100vh-64px)] overflow-y-auto p-4">
        <LeftMenuItem 
          component={VSMenuTopic.Home} 
          title={'Home'} 
          activecomponent={activecomponent} 
          onSelect={onSelect} />

        {hasFietsberaadSuperadmin && 
          <LeftMenuItem 
            component={VSMenuTopic.UsersGebruikersbeheerFietsberaad} 
            title={`Gebruikers`} 
            compact={true} 
            activecomponent={activecomponent} 
            onSelect={onSelect} />}

        {hasFietsberaadSuperadmin && <LeftMenuItem 
          component={false} 
          title={'Organisaties'} 
          compact={false} 
          activecomponent={activecomponent} 
          onSelect={onSelect}>
            <ul className="ml-4 mt-1">
              <LeftMenuItem 
                component={VSMenuTopic.ContactsGemeenten} 
                title={'Data-eigenaren'} 
                activecomponent={activecomponent} 
                onSelect={onSelect} />
              <LeftMenuItem 
                component={VSMenuTopic.ContactsExploitanten} 
                title={'Exploitanten'} 
                activecomponent={activecomponent} 
                onSelect={onSelect} />
              <LeftMenuItem 
                  component={VSMenuTopic.ContactsDataproviders} 
                  title={'Dataleveranciers'} 
                  activecomponent={activecomponent} 
                  onSelect={onSelect} />
            </ul>
          </LeftMenuItem> 
        }

        {(hasFietsberaadAdmin || hasFietsberaadSuperadmin) && 
          <LeftMenuItem 
            component={false} 
            title={'Website beheer'} compact={false} activecomponent={activecomponent} onSelect={onSelect}>
            <ul className="ml-4 mt-1">
              <LeftMenuItem component={VSMenuTopic.ArticlesPages} title={'Pagina\'s'} compact={true} activecomponent={activecomponent} onSelect={onSelect} />
              <LeftMenuItem component={VSMenuTopic.Faq} title={'FAQ'} compact={true} activecomponent={activecomponent} onSelect={onSelect} />
            </ul>
          </LeftMenuItem>
        }

        {hasFietsberaadAdmin && 
          <LeftMenuItem 
            component={VSMenuTopic.Database} 
            title={'Database'} 
            activecomponent={activecomponent} 
            onSelect={onSelect} />
        }

        { hasAcceptatieOntwikkeling && 
          <LeftMenuItem 
            component={false} 
            title={'Ontwikkeling'} compact={false} activecomponent={activecomponent} onSelect={onSelect}>
            <ul className="ml-4 mt-1">
              <LeftMenuItem component={VSMenuTopic.ExploreGemeenten} title={'Gemeenten'} compact={true} activecomponent={activecomponent} onSelect={onSelect} />
              <LeftMenuItem component={VSMenuTopic.ExploreUsers} title={'Gebruikers'} compact={true} activecomponent={activecomponent} onSelect={onSelect} />
              {/* <LeftMenuItem component={VSMenuTopic.ExploreUsersColdfusion} title={'Gebruikers (Oude structuur)'} compact={true} activecomponent={activecomponent} onSelect={onSelect} />
              <LeftMenuItem component={VSMenuTopic.ExplorePages} title={`Pagina's`} compact={true} activecomponent={activecomponent} onSelect={onSelect} /> */}
              {/* <LeftMenuItem component={VSMenuTopic.TestDatabaseApi} title={'Test Database API'} compact={true} activecomponent={activecomponent} onSelect={onSelect} /> */}
            </ul>
          </LeftMenuItem>
        }
    </ul>
  );
}

export default LeftMenuFietsberaad;
