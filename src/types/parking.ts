import type { fietsenstallingtypen, abonnementsvormen, fietsenstallingen } from "~/generated/prisma-client";

export type VSParking = Pick<fietsenstallingen,
"ID" | 
"StallingsID" | 
"Title" |
"Type" 
>

export type ParkingSectionPerBikeType = {
    Toegestaan: boolean | null,
    Capaciteit: number | null,
    fietstype: {
        Name: string // Assuming Name is of type string
    }
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
  fietsenstallingsID: string,
  openingDateTime: Date,
  closingDateTime: Date,
}

export type UitzonderingenOpeningstijden = UitzonderingOpeningstijden[];

export type ParkingSections = ParkingSection[];

export type ParkingDetailsType = {
    ID: string,
    Status: string,
    EditorCreated: string,
    Title: string,
    Location: string,
    Postcode: string,
    Plaats: string,
    Type: string,
    SiteID: string,
    StallingsID: string,
    Description: string;
    Image: any;
    Open_ma: Date,
    Dicht_ma: Date,
    Open_di: Date,
    Dicht_di: Date,
    Open_wo: Date,
    Dicht_wo: Date,
    Open_do: Date,
    Dicht_do: Date,
    Open_vr: Date,
    Dicht_vr: Date,
    Open_za: Date,
    Dicht_za: Date,
    Open_zo: Date,
    Dicht_zo: Date,
    Openingstijden: string,
    Capacity: number,
    Coordinaten: string | null,
    DateCreated: Date,
    DateModified: Date,
    FMS: boolean,
    Beheerder: string,
    BeheerderContact: string,
    BerekentStallingskosten: boolean,
    fietsenstalling_type: fietsenstallingtypen[],
    fietsenstalling_secties: ParkingSections,
    uitzonderingenopeningstijden: UitzonderingenOpeningstijden,

    // abonnementen: abonnementsvorm_fietsenstalling[],
    abonnementsvorm_fietsenstalling: {
        SubscriptionTypeID: number,
        BikeparkID: string,
        abonnementsvormen: abonnementsvormen
    }[],
    Tariefcode: number,
    ExtraServices: string,
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
    ExploitantID: string,
    exploitant: {
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
    Title: true,
    ID: true,
    SiteID: true,
    Location: true,
    Postcode: true,
    Plaats: true,
    Type: true,
    Image: true,
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
    Capacity: true,
    Coordinaten: true,
    Beheerder: true,
    BeheerderContact: true,
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
        abonnementsvormen: {
          select: {
            ID: true,
            naam: true,
            omschrijving: true,
            prijs: true,
            tijdsduur: true,
            conditions: true,
            siteID: true,
            bikeparkTypeID: true,
            isActief: true,
            exploitantSiteID: true,
            idmiddelen: true,
            contractID: true,
            paymentAuthorizationID: true,
            conditionsID: true
          }
        }
      }
    },
    exploitant: {
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