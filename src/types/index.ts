
/* This type is used when returning parking details to the client                */
/* By adding fields to this structure, it is possible to keep track which fields */
/* from the "old" database are in use                                            */
export type DayPrefix = 'ma' | 'di' | 'wo' | 'do' | 'vr' | 'za' | 'zo';


export enum VSMenuTopic {
    // "Abonnementen" = "abonnementen",
    // "Abonnementsvormen" = "abonnementsvormen",
    "Accounts" = "accounts",
    "ApisGekoppeldeLocaties" = "apisgekoppeldelocaties",
    "ApisOverzicht" = "apisoverzicht",
    "ArticlesAbonnementen" = "articlesabonnementen",
    "ArticlesArticles" = "articlesarticles",
    "ArticlesBuurtstallingen" = "articlesbuurtstallingen",
    "ArticlesFietskluizen" = "articlesfietskluizen",
    "ArticlesPages" = "articlespages",
    // "BarcodereeksenFietsstickers" = "barcodereeksenfietsstickers",
    // "BarcodereeksenSleutelhangers" = "barcodereeksensleutelhangers",
    // "BarcodereeksenUitgifteBarcodes" = "barcodereeksenuitgiftebarcodes",
    "Buurtstallingen" = "buurtstallingen",
    "ContactsAdmin" = "contactsadmin",
    "ContactsDataproviders" = "contactsdataproviders",
    "ContactsExploitanten" = "contactsexploitanten",
    "ContactsGemeenten" = "contactsgemeenten",
    "Database" = "database",
    "Development" = "development",
    "Documents" = "documents",
    "ExploreGemeenten" = "exploregemeenten",
    "ExploreUsers" = "exploreusers",
    "ExplorePages" = "explorepages",
    "Export" = "export",
    "Faq" = "faq",
    "Fietsenstallingen" = "fietsenstallingen",
    "Fietskluizen" = "fietskluizen",
    "Home" = "home",
    "Logboek" = "logboek",
    // // "Presentations" = "presentations",
    // "Products" = "products",
    "Report" = "report",
    "Settings" = "settings",
    "SettingsGemeente" = "settingsgemeente",
    "SettingsExploitant" = "settingsexploitant",
    "SystemSettings" = "systemsettings",
    "UsersBeheerders" = "usersbeheerders",
    "UsersGebruikersbeheerFietsberaad" = "usersgebruikersbeheerfietsberaad",
    "UsersGebruikersbeheerGemeente" = "usersgebruikersbeheergemeente",
    "UsersGebruikersbeheerExploitant" = "usersgebruikersbeheerexploitant",
    "UsersGebruikersbeheerBeheerder" = "usersgebruikersbeheerbeheerder",
    "Website" = "website",

    "TestDatabaseApi" = "testdatabaseapi",
}