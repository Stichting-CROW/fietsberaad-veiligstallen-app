import React from 'react';
import dynamic from 'next/dynamic';
import { VSMenuTopic } from "~/types/index";
import type { VSUserSecurityProfile } from "~/types/securityprofile";
import type { VSContactGemeenteInLijst, VSContactExploitant } from "~/types/contacts";

const LeftMenuFietsberaad = dynamic(() => import('~/components/beheer/LeftMenuFietsberaad'), { ssr: false });
const LeftMenuGemeente = dynamic(() => import('~/components/beheer/LeftMenuGemeente'), { ssr: false });
const LeftMenuExploitant = dynamic(() => import('~/components/beheer/LeftMenuExploitant'), { ssr: false });

export interface RenderLeftMenuParams {
  selectedContactID: string;
  activecomponent: VSMenuTopic | undefined;
  securityProfile?: VSUserSecurityProfile;
  gemeenten: VSContactGemeenteInLijst[];
  exploitanten: VSContactExploitant[];
  onSelect: (componentKey: VSMenuTopic) => void;
  hasAbonnementenModule?: boolean;
}

export const renderLeftMenu = ({
  selectedContactID,
  activecomponent,
  securityProfile,
  gemeenten,
  exploitanten,
  onSelect,
  hasAbonnementenModule = false,
}: RenderLeftMenuParams): React.ReactElement => {
  // If user is Fietsberaad, show the Fietsberaad left menu
  if (selectedContactID === "1") {
    return (
      <div className="min-w-[280px]">
        <LeftMenuFietsberaad
          securityProfile={securityProfile}
          activecomponent={activecomponent}
          onSelect={onSelect}
        />
      </div>
    );
  }
  // If user is a Gemeente, show the Gemeente left menu
  else if (gemeenten.find(gemeente => gemeente.ID === selectedContactID)) {
    return (
      <div className="min-w-[280px]">
        <LeftMenuGemeente
          securityProfile={securityProfile}
          activecomponent={activecomponent}
          onSelect={onSelect}
          hasAbonnementenModule={hasAbonnementenModule}
        />
      </div>
    );
  }
  // If user is an Exploitant, show the Exploitant left menu
  else if (exploitanten.find(exploitant => exploitant.ID === selectedContactID)) {
    return (
      <div className="min-w-[280px]">
        <LeftMenuExploitant
          securityProfile={securityProfile}
          activecomponent={activecomponent}
          onSelect={onSelect}
        />
      </div>
    );
  }
  // By default: render empty left menu
  else {
    return (
      <div className="min-w-[280px]">
        <nav
          id="leftMenu"
          className="h-[calc(100vh-64px)] shrink-0 overflow-y-auto border-r border-gray-200 bg-white px-5 py-6"
          aria-label="Hoofdmenu"
        >
          <ul className="space-y-1" />
        </nav>
      </div>
    );
  }
};
