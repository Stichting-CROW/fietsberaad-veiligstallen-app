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
  "exploitant_superadmin" = "exploitant_superadmin",
  "acceptatie_ontwikkeling" = "acceptatie_ontwikkeling",
  "exploitanten_toegangsrecht" = "exploitanten_toegangsrecht",
  "gebruikers_dataeigenaar_admin" = "gebruikers_dataeigenaar_admin",
  "gebruikers_dataeigenaar_beperkt" = "gebruikers_dataeigenaar_beperkt",
  "instellingen_dataeigenaar" = "instellingen_dataeigenaar",
  "instellingen_site_content" = "instellingen_site_content",
  "instellingen_fietsenstallingen_admin" = "instellingen_fietsenstallingen_admin",
  "instellingen_fietsenstallingen_beperkt" = "instellingen_fietsenstallingen_beperkt",
  "rapportages" = "rapportages",
}

export const SECURITY_TOPIC_INFO: { topic: VSSecurityTopic, name: string, description: string }[] = [
  {
    topic: VSSecurityTopic.fietsberaad_superadmin,
    name: "Beheer door fietsberaad",
    description: [
      "Toevoegen / archiveren van data-eigenaren",
      "Instellen van gegevens voor data-eigenaren:",
      " - Instellen contactpersoon",
      " - Instellen modules",
      " - Instellen overige gegevens",
      " - Instellen Alternatieve naam organisatie",
      " - instellen URL-vriendelijke URL",
      "Toevoegen / archiveren van exploitanten",
      "Instellen van gegeven voor exploitanten",
      "Toevoevoegen / Verwijderen van dataleveranciers",
      "Instellen van gegevens voor dataleveranciers"
    ].join(",")
  },
  {
    topic: VSSecurityTopic.fietsberaad_admin,
    name: "Beheer website door fietsberaad",
      description: [
        "Beheer algemene pagina's",
        "Beheer algemene FAQ artikelen"].join(",")
  },
  {
    topic: VSSecurityTopic.exploitant_superadmin,
    name: "Beheer van exploitant gebruikers door expoitant",
    description: [
      "koppelen exploitantgebruiker aan data-eigenaar",
      "Instellen rol exploitantgebruiker bij data-eigenaar"
    ].join(",")
  },
  {
    topic: VSSecurityTopic.acceptatie_ontwikkeling,
    name: "Beta functionaliteit",
    description: [
      "Alle functionaliteit die nog niet in productie is",
      "(alleen beschikbaar in de acceptatiomgeving)"
    ].join(",")
  },
  { 
    topic: VSSecurityTopic.instellingen_dataeigenaar, 
    name: "Instellingen huidige organisatie (data-eigenaar)",
    description: [
      "Naam organisatie aanpassen",
      "Logo's wijzigen",
      "E-mail helpdesk instellen",
      // "Minimum stallingstegoed kluizen",
      // "Kluis gesloten houden bij",
      "Coördinaten gemeente instellen",
      // "Google maps zoomniveau instellen",
      "Huisstijlkleuren instellen",
      "Dagstart instellen"
    ].join(",")
  },
  {
    topic: VSSecurityTopic.gebruikers_dataeigenaar_admin,
    name: "Gebruikers huidige organisatie (dataeigenaar)",
    description: [
      "Toevoegen / archiveren van gebruikers",
      "Instellen van de rol van een gebruiker",
    ].join(",")
  },
  { 
    topic: VSSecurityTopic.gebruikers_dataeigenaar_beperkt,
    name: "Gebruikers huidige organisatie (dataeigenaar)",
    description: [
      "Instellen overige gegevens van een gebruiker"
    ].join(",")
  },
  {
    topic: VSSecurityTopic.exploitanten_toegangsrecht,
    name: "Beheer exploitanten bij huidige organisatie (data-eigenaar)",
    description: [
      "Instellingen voor beheer van data-eigenaars tot deze organisatie door een of meer exploitanten"
    ].join(",")
  },
  {
    topic: VSSecurityTopic.instellingen_fietsenstallingen_admin,
    name: "Instellingen fietsenstallingen",
    description: [
      "Locatie stallingen - Nieuwe fietsenstalling",
      "Locatie stallingen - Item bewerken",
      "Algemeen - Toon dit item op website",
      "Algemeen - Stalling communiceert met FMS",
      "Algemeen - Type stalling",
      "Algemeen - Exploitant/beheerder",
      "Algemeen - Contact beheerder",
      "Algemeen - Coördinaten stalling",
      "Sector stallingen toevoegen/wijzigen",
      "Sector en capaciteit kluizen - aantal",
      "Sectoren en capaciteit - reserveerbaar",
    ].join(",")
  },
  {
    topic: VSSecurityTopic.instellingen_fietsenstallingen_beperkt,
    name: "Instellingen fietsenstallingen",
    description: [
      "Algemeen - Naam stalling",
      "Algemeen - Foto",
      "Algemeen - Beschrijving",
      "Algemeen - Adres",
      "Algemeen - Postcode",
      "Algemeen - Plaats",
      "Algemeen - Bij station",
      "Algemeen - Max stallingsduur",
      "Algemeen - Services",
      "Algemeen - Andere services",
      "Openingstijden - tijden",
      "Openingstijden - uitzonderingen",
      "Openingstijden - extra info"
    ].join(",")
  },
  {
    topic: VSSecurityTopic.instellingen_site_content,
    name: "Beheer website",
    description: [
      "Beheer pagina's voor huidige organisatie",
      "Beheer FAQ artikelen voor huidige organisatie"
    ].join(",")
  },
  {
    topic: VSSecurityTopic.rapportages,
    name: "Rapportages",
    description: [
      "Grafieken bekijken",
      "Ruwe data per stalling",
      "Financieel maandoverzicht downloaden",
      "Logboek inzien",
      "CSV's downloaden"
    ].join(",")
  },
]
