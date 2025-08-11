import type { contacts } from "~/generated/prisma-client";
import type { VSParking } from "~/types/parking";


export enum VSContactItemType {
    Admin = "admin",
    Dataprovider = "dataprovider",
    Exploitant = "exploitant",
    Organizations = "organizations",
}
export interface VSContactExploitant {
    ID: string;
    CompanyName: string | null;
    UrlName: string | null;
    ItemType: VSContactItemType | null;
    Helpdesk: string | null;
    Status: string | null;
    CompanyLogo: string | null;
    CompanyLogo2: string | null;
    ThemeColor1: string | null;
    ThemeColor2: string | null;
    isManagingContacts: {
      ID: number;
      childSiteID: string;
      admin: boolean;
    }[];
    // isManagedByContacts: {
    //   ID: number;
    //   parentSiteID: string;
    //   admin: boolean;
    // }[];
    // modules_contacts: {
    //   module: VSModule;
    // }[];
  }
  
  export const exploitantSelect = {
      ID: true,
      CompanyName: true,
      UrlName: true,
      ItemType: true,
      Helpdesk: true,
      Status: true,
    //   isManagedByContacts: {
    //       select: {
    //           ID: true,
    //           parentSiteID: true,
    //           admin: true
    //       }
    //   },
      isManagingContacts: {
          select: {
              ID: true,
              childSiteID: true,
              admin: true
          }
      },
    //   modules_contacts: {
    //       select: {
    //           module: {
    //               select: {
    //                   ID: true,
    //                   Name: true
    //               }
    //           }
    //       }
    //   }
  }

  export type VSContactGemeenteInLijst = Pick<contacts, 
  "ID" | 
  "CompanyName" |
  "CompanyLogo" | 
  "ThemeColor1" |
  "ThemeColor2" 
  > & {
    hasStallingen: boolean;
    hasExploitanten: boolean;
    hasUsers: boolean;
  }
  
  export type VSContactGemeente = Pick<contacts, 
      "ID" | 
      "CompanyName" |
      "ItemType" | 
      "AlternativeCompanyName" | 
      "UrlName" | 
      "ZipID" | 
      "Helpdesk" | 
      "DayBeginsAt" | 
      "Coordinaten" | 
      "Zoom" | 
      "Bankrekeningnr" | 
      "PlaatsBank" | 
      "Tnv" | 
      "Notes" | 
      "DateRegistration" | 
      "CompanyLogo" | 
      "CompanyLogo2" |
      "ThemeColor1" |
      "ThemeColor2" |
      "CompanyLogo" |
      "CompanyLogo2" |
      "contactID"
  > & {
          isManagingContacts?: {
              ID: number;
              childSiteID: string;
              admin: boolean;
          }[];
      } & {   
          isManagedByContacts?: {
              ID: number;
              parentSiteID: string;
              admin: boolean;
          }[];
      };

    export const gemeenteLijstSelect = {
        ID: true,
        CompanyName: true,
        CompanyLogo: true,
        ThemeColor1: true,
        ThemeColor2: true,
        fietsenstallingen_fietsenstallingen_SiteIDTocontacts: {
          where: {
            StallingsID: { not: null },
            Title: {
              not: 'Systeemstalling'
            }
          },
          select: {
            ID: true,
            Title: true,
            StallingsID: true,
            Type: true,
          }
        },
        isManagingContacts: {
            select: {
                ID: true,
                childSiteID: true,
                admin: true
            }
        },
        isManagedByContacts: {
            select: {
                ID: true,
                parentSiteID: true,
                admin: true
            }
        },
        modules_contacts: {
          select: {
            module: {
                select : {
                    ID: true,
                    Name: true
                }
            }
          }
        }  
    };
    
    export const gemeenteSelect = {
      ID: true, 
      CompanyName: true, 
      ItemType: true,
      AlternativeCompanyName: true,
      UrlName: true,
      ZipID: true,
      Helpdesk: true,
      CompanyLogo: true,
      CompanyLogo2: true,
      ThemeColor1: true,
      ThemeColor2: true,
      DayBeginsAt: true,
      Coordinaten: true,
      Zoom: true,
      Bankrekeningnr: true,
      PlaatsBank: true,
      Tnv: true,
      Notes: true,
      DateRegistration: true,
      fietsenstallingen_fietsenstallingen_SiteIDTocontacts: {
        where: {
          StallingsID: { not: null },
          Title: {
            not: 'Systeemstalling'
          }
        },
        select: {
          ID: true,
          Title: true,
          StallingsID: true,
          Type: true,
        }
      },
      isManagingContacts: {
          select: {
              ID: true,
              childSiteID: true,
              admin: true
          }
      },
      isManagedByContacts: {
          select: {
              ID: true,
              parentSiteID: true,
              admin: true
          }
      },
      modules_contacts: {
        select: {
          module: {
              select : {
                  ID: true,
                  Name: true
              }
          }
        }
      }
    }
  
export type VSContactDataprovider = Pick<contacts,
  "ID" |
  "CompanyName" |
  "ItemType" |
  "UrlName" | 
  "Password" |
  "Status" |
  "DateRegistration" |
  "DateConfirmed" |
  "DateRejected"
  >
  
export const dataproviderSelect = {
  ID: true,
  CompanyName: true,
  ItemType: true,
  UrlName: true,
  Password: true,
  Status: true,
  DateRegistration: true,
  DateConfirmed: true,
  DateRejected: true
}

export type VSContactInLijst = Pick<contacts, 
  "ID" | 
  "FirstName" |
  "LastName" |
  "Email1" |
  "Phone1"
> & {
  hasUsers: boolean;
  hasStallingen: boolean;
};

export type VSContact = Pick<contacts, 
  "ID" | 
  "FirstName" |
  "LastName" |
  "Email1" |
  "Phone1" |
  "Mobile1" |
  "JobTitle" |
  "Notes" |
  "DateRegistration" |
  "DateConfirmed" |
  "DateRejected" |
  "ItemType" |
  "CompanyLogo" |
  "CompanyLogo2"
> & {
  managesFietsenstallingen?: VSParking[];
};

export const contactLijstSelect = {
  ID: true,
  FirstName: true,
  LastName: true,
  Email1: true,
  Phone1: true,
  // managesFietsenstallingen: {
  //   select: {
  //     ID: true,
  //     Title: true,
  //     StallingsID: true,
  //     Type: true,
  //   }
  // }
};

export const contactSelect = {
  ID: true,
  FirstName: true,
  LastName: true,
  Email1: true,
  Phone1: true,
  Mobile1: true,
  JobTitle: true,
  Notes: true,
  DateRegistration: true,
  DateConfirmed: true,
  DateRejected: true,
  ItemType: true,
  CompanyLogo: true,
  CompanyLogo2: true,
  // managesFietsenstallingen: {
  //   select: {
  //     ID: true,
  //     Title: true,
  //     StallingsID: true,
  //     Type: true,
  //   }
  // }
};
