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
  "Abonnementen" = "abonnementen",
  // "Abonnementsvormen" = "abonnementsvormen",
  "Accounts" = "accounts",
  "ApisGekoppeldeLocaties" = "apisgekoppeldelocaties",
  "ApisOverzicht" = "apisoverzicht",
  // "ArticlesAbonnementen" = "articlesabonnementen",
  // "ArticlesArticles" = "articlesarticles",
  // "ArticlesBuurtstallingen" = "articlesbuurtstallingen",
  // "ArticlesFietskluizen" = "articlesfietskluizen",
  // "ArticlesPages" = "articlespages",
  // "BarcodereeksenFietsstickers" = "barcodereeksenfietsstickers",
  "BarcodereeksenSleutelhangers" = "barcodereeksensleutelhangers",
  // "BarcodereeksenUitgifteBarcodes" = "barcodereeksenuitgiftebarcodes",
  "Buurtstallingen" = "buurtstallingen",
  // "ContactsAdmin" = "contactsadmin",
  "ContactsDataproviders" = "contactsdataproviders",
  "ContactsExploitanten" = "contactsexploitanten",
  "ContactsGemeenten" = "contactsgemeenten",
  // "Database" = "database",
  "Development" = "development",
  "Documents" = "documents",
  // "ExploreExploitanten" = "exploreexploitanten",
  // "ExploreGemeenten" = "exploregemeenten",
  // "ExploreUsers" = "exploreusers",
  // "Export" = "export",
  // "Faq" = "faq",
  // "Fietsenstallingen" = "fietsenstallingen",
  "Fietskluizen" = "fietskluizen",
  // "Home" = "home",
  // "Logboek" = "logboek",
  "Presentations" = "presentations",
  // "Products" = "products",
  "Report" = "report",
  // "Settings" = "settings",
  // "StallingInfo" = "stallinginfo",
  "System" = "system",
  // "UsersBeheerders" = "usersbeheerders",
  "UsersGebruikersbeheer" = "usersgebruikersbeheer",
  "Website" = "website",
}

