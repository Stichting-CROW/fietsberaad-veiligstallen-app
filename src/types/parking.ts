import type { fietsenstallingen } from "~/generated/prisma-client";

export type VSParking = Pick<fietsenstallingen,
"ID" | 
"StallingsID" | 
"Title" |
"Type" 
>

export type ParkingStatus = "0" | "1" | "new" | "aanm" | "x";

export type ParkingSectionPerBikeType = {
    Toegestaan: boolean | null,
    Capaciteit: number | null,
    fietstype: {
        Name: string | null // Assuming Name is of type string
    } | null
}

export type ParkingSection = {
    titel: string,
    secties_fietstype: ParkingSectionPerBikeType[] // base data for capacity
}

export type UpdateParkingSectionsData = {
    parkingId: string,
    sectionId: number,
    parkingSections: ParkingSections
}

export type UitzonderingOpeningstijden = {
  ID: string,
  fietsenstallingsID: string | null,
  openingDateTime: Date| null,
  closingDateTime: Date| null,
}

export type UitzonderingenOpeningstijden = UitzonderingOpeningstijden[];

export type ParkingSections = ParkingSection[];

export type AbonnementsvormenType = {
  ID: number;
  naam: string | null;
  omschrijving: string | null;
  prijs: number | null;
  tijdsduur: number | null;
  conditions: string | null;
  siteID: string | null;
  bikeparkTypeID: string | null;
  isActief: boolean;
  exploitantSiteID: string | null;
  idmiddelen: string;
  contractID: string | null;
  paymentAuthorizationID: string | null;
  conditionsID: string | null;
  allowedBikeTypes?: string[];
};

export type ParkingDetailsType = {
    ID: string,
    StallingsID: string,
    SiteID: string | null,
    Title: string | null,
    StallingsIDExtern: string | null, // not used in the app
    Description: string | null,
    Image: any | null,
    Location: string | null,
    Postcode: string | null,
    Plaats: string | null,
    Capacity: number | null,
    Status: string | null,
    Type: string | null,
    Open_ma: Date | null,
    Dicht_ma: Date | null,
    Open_di: Date | null,
    Dicht_di: Date | null,
    Open_wo: Date | null,
    Dicht_wo: Date | null,
    Open_do: Date | null,
    Dicht_do: Date | null,
    Open_vr: Date | null,
    Dicht_vr: Date | null,
    Open_za: Date | null,
    Dicht_za: Date | null,
    Open_zo: Date | null,
    Dicht_zo: Date | null,
    Openingstijden: string | null,
    Coordinaten: string | null,
    EditorCreated: string | null;
    DateCreated: Date | null;
    EditorModified: string | null;
    DateModified: Date | null;
    Ip: string | null; // not used in the app
    Verwijssysteem: boolean; // not used in the app
    VerwijssysteemOverzichten: boolean | null; // not used in the app
    FMS: boolean | null; // Check if/how this is still used
    Beheerder: string | null,
    BeheerderContact: string | null,
    HelpdeskHandmatigIngesteld: boolean | null,
    OmschrijvingTarieven: string | null;
    IsStationsstalling: boolean; // not used in the app
    IsPopup: boolean; // not used in the app
    NotaVerwijssysteem: string | null; // not used in the app
    Tariefcode: number,
    Toegangscontrole: number | null;
    Url: string | null;
    ExtraServices: string | null;
    dia: string | null; // not used in the app
    BerekentStallingskosten: boolean;
    AantalReserveerbareKluizen: number; // not used in the app
    MaxStallingsduur: number; // not used in the app
    HeeftExterneBezettingsdata: boolean; // not used in the app
    ExploitantID: string | null;
    hasUniSectionPrices: boolean; // not used in the app
    hasUniBikeTypePrices: boolean; // not used in the app
    shadowBikeparkID: string | null;
    BronBezettingsdata: string | null; // Not used in the app
    reservationCostPerDay: number | null; // Removed from record in prisma.ts
    // wachtlijst_Id: bigint | null; // Removed from record in prisma.ts
    thirdPartyReservationsUrl: string | null; // Not used in the app

    fietsenstalling_type?: {
        id: string,
        name: string,
        sequence: number
    } | null,
    fietsenstalling_secties: ParkingSections | null,
    uitzonderingenopeningstijden: UitzonderingenOpeningstijden | null,

    // abonnementen: abonnementsvorm_fietsenstalling[],
    abonnementsvorm_fietsenstalling: {
        SubscriptiontypeID: number,
        BikeparkID: string,
        // abonnementsvormen: AbonnementsvormenType[]
    }[],
    // abonnementsvormen: {
    //     ID: string,
    //     naam: string,
    //     omschrijving: string,
    //     prijs: string,
    //     tijdsduur: string,
    //     conditions: string,
    //     siteID: string,
    //     bikeparkTypeID: string,
    //     isActief: string,
    //     exploitantSiteID: string,
    //     idmiddelen: string,
    //     contractID: string,
    //     paymentAuthorizationID: string,
    //     conditionsID: string
    // }[]
    // },
    contacts_fietsenstallingen_SiteIDTocontacts?: {
      ID: string,
      Helpdesk: string,
      CompanyName: string,
    },
    contacts_fietsenstallingen_ExploitantIDTocontacts?: {
        ID: string,
        Helpdesk: string,
        CompanyName: string,
    },
    fietsenstallingen_services:
    {
        services: {
            ID: string,
            Name: string
        }
    }[]
}

export const selectParkingDetailsType = {
  ID: true,
  StallingsID: true,
  SiteID: true,
  Title: true,
  StallingsIDExtern: true,
  Description: true,
  Image: true,
  Location: true,
  Postcode: true,
  Plaats: true,
  Capacity: true,
  Status: true,
  Type: true,
  Open_ma: true,
  Dicht_ma: true,
  Open_di: true,
  Dicht_di: true,
  Open_wo: true,
  Dicht_wo: true,
  Open_do: true,
  Dicht_do: true,
  Open_vr: true,
  Dicht_vr: true,
  Open_za: true,
  Dicht_za: true,
  Open_zo: true,
  Dicht_zo: true,
  Openingstijden: true,
  Coordinaten: true,
  EditorCreated: true,
  DateCreated: true,
  EditorModified: true,
  DateModified: true,
  Ip: true, // not used in the app
  Verwijssysteem: true, // not used in the app
  VerwijssysteemOverzichten: true, // not used in the app
  FMS: true, // Check if/how this is still used
  Beheerder: true,
  BeheerderContact: true,
  HelpdeskHandmatigIngesteld: true,
  OmschrijvingTarieven: true,
  IsStationsstalling: true,
  IsPopup: true,
  NotaVerwijssysteem: true, // not used in the app
  Tariefcode: true,
  Url: true,
  ExtraServices: true,
  dia: true, // not used in the app
  BerekentStallingskosten: true, // not used in the app
  MaxStallingsduur: true, // not used in the app
  HeeftExterneBezettingsdata: true, // not used in the app
  ExploitantID: true,
  hasUniSectionPrices: true, // not used in the app
  hasUniBikeTypePrices: true, // not used in the app
  shadowBikeparkID: true,
  BronBezettingsdata: true, // Not used in the app
  reservationCostPerDay: true, // Removed from record in prisma.ts
  // wachtlijst_Id: true, // Removed from record in prisma.ts
  thirdPartyReservationsUrl: true, // Not used in the app

    fietsenstalling_type: {
      select: {
        id: true,
        name: true,
        sequence: true,
      }
    },
    fietsenstalling_secties: {
      select: {
        titel: true,
        secties_fietstype: {
          select: {
            Toegestaan: true,
            Capaciteit: true,
            fietstype: { select: { Name: true } },
          },
        },
      },
    },
    uitzonderingenopeningstijden: {
      select: {
        ID: true,
        openingDateTime: true,
        closingDateTime: true,
        fietsenstallingsID: true,
      }
    },
    abonnementsvorm_fietsenstalling: {
      select: {
        SubscriptiontypeID: true,
        BikeparkID: true,
        // abonnementsvormen: {
        //   select: {
        //     ID: true,
        //     naam: true,
        //     omschrijving: true,
        //     prijs: true,
        //     tijdsduur: true,
        //     conditions: true,
        //     siteID: true,
        //     bikeparkTypeID: true,
        //     isActief: true,
        //     exploitantSiteID: true,
        //     idmiddelen: true,
        //     contractID: true,
        //     paymentAuthorizationID: true,
        //     conditionsID: true
        //   }
        // }
      }
    },
    contacts_fietsenstallingen_SiteIDTocontacts: {
      select: {
        ID: true,
        CompanyName: true,
        Helpdesk: true,
      }
    },
    contacts_fietsenstallingen_ExploitantIDTocontacts: {
      select: {
        ID: true,
        Helpdesk: true,
        CompanyName: true,
      }
    },
    fietsenstallingen_services: {
      select: {
        services: {
          select: {
            ID: true,
            Name: true
          }
        }
      }
    }
  }

  export type VSFietsenstallingType = {
    id: string,
    name: string,
    sequence: number
  }