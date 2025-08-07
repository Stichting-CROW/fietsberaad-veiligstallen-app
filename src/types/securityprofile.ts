import { type VSUserRoleValuesNew } from './users';

export type VSCRUDRight = {
  create: boolean;
  read: boolean;
  update: boolean;
  delete: boolean;
};

export type VSUserSecurityProfile = {
  roleId: VSUserRoleValuesNew;
  rights: {
      [key in VSSecurityTopic]?: VSCRUDRight;
  };
};

export enum VSSecurityTopic {
  "fietsberaad_superadmin" = "fietsberaad_superadmin",
  "fietsberaad_admin" = "fietsberaad_admin",
  "exploitanten_toegangsrecht" = "exploitanten_toegangsrecht",
  "gebruikers_dataeigenaar_admin" = "gebruikers_dataeigenaar_admin",
  "gebruikers_dataeigenaar_beperkt" = "gebruikers_dataeigenaar_beperkt",
  "instellingen_dataeigenaar" = "instellingen_dataeigenaar",
  "instellingen_site_content" = "instellingen_site_content",
  "instellingen_fietsenstallingen_admin" = "instellingen_fietsenstallingen_admin",
  "instellingen_fietsenstallingen_beperkt" = "instellingen_fietsenstallingen_beperkt",
  "rapportages" = "rapportages",
}

export const VSSecurityTopicInfo: { topic: VSSecurityTopic, description: string }[] = [
  { 
    topic: VSSecurityTopic.instellingen_dataeigenaar, 
    description: "Naam organisatie aanpassen,Logo's wijzigen,E-mail helpdesk instellen,Minimum stallingstegoed kluizen,Kluis gesloten houden bij,Coördinaten gemeente instellen,Google maps zoomniveau instellen,Huisstijlkleuren instellen,Dagstart instellen" 
  },
]