import { z } from "zod";
import { type ParkingDetailsType, type UitzonderingenOpeningstijden } from "~/types/parking";
import { parseLatLng } from "~/utils/map/coordinates";

export type VSFietsenstallingLijst = {
  ID: string;
  StallingsID: string | null;
  Title: string | null;
  Location: string | null;
  Plaats: string | null;
  Capacity: number | null;
  Status: string | null;
  Type: string | null;
  ExploitantID: string | null;
  SiteID: string | null;
  Postcode: string | null;
  Coordinaten: string | null;
  Image: string | null;
  Description: string | null;
  Openingstijden: string | null;
  Tariefcode: number | null;
  EditorCreated: string | null;
  Open_ma: Date | string | null;
  Dicht_ma: Date | string | null;
  Open_di: Date | string | null;
  Dicht_di: Date | string | null;
  Open_wo: Date | string | null;
  Dicht_wo: Date | string | null;
  Open_do: Date | string | null;
  Dicht_do: Date | string | null;
  Open_vr: Date | string | null;
  Dicht_vr: Date | string | null;
  Open_za: Date | string | null;
  Dicht_za: Date | string | null;
  Open_zo: Date | string | null;
  Dicht_zo: Date | string | null;
  uitzonderingenopeningstijden: UitzonderingenOpeningstijden | null;
};

export const getDefaultNewFietsenstalling = (name: string): ParkingDetailsType => ({
  ID: "new",
  StallingsID: `T${Date.now().toString().slice(-7)}`,
  SiteID: null,
  Title: name,
  StallingsIDExtern: null,
  Description: null,
  Image: null,
  Location: "",
  Postcode: null,
  Plaats: "",
  Capacity: 0,
  Openingstijden: null,
  Status: "1",
  EditorCreated: null,
  DateCreated: null,
  EditorModified: null,
  DateModified: null,
  Ip: null,
  Coordinaten: null,
  Type: "bewaakt",
  Verwijssysteem: false,
  VerwijssysteemOverzichten: null,
  FMS: false,
  Open_ma: null,
  Dicht_ma: null,
  Open_di: null,
  Dicht_di: null,
  Open_wo: null,
  Dicht_wo: null,
  Open_do: null,
  Dicht_do: null,
  Open_vr: null,
  Dicht_vr: null,
  Open_za: null,
  Dicht_za: null,
  Open_zo: null,
  Dicht_zo: null,
  OmschrijvingTarieven: null,
  IsStationsstalling: false,
  IsPopup: false,
  NotaVerwijssysteem: null,
  Tariefcode: 0,
  Toegangscontrole: null,
  Beheerder: null,
  BeheerderContact: null,
  Url: null,
  ExtraServices: null,
  dia: null,
  BerekentStallingskosten: false,
  AantalReserveerbareKluizen: 0,
  MaxStallingsduur: 0,
  HeeftExterneBezettingsdata: false,
  ExploitantID: null,
  hasUniSectionPrices: false,
  hasUniBikeTypePrices: false,
  shadowBikeparkID: null,
  BronBezettingsdata: "FMS",
  reservationCostPerDay: null,
  // wachtlijst_Id: null,
  thirdPartyReservationsUrl: null,
  fietsenstalling_secties: [],
  uitzonderingenopeningstijden: [],
  abonnementsvorm_fietsenstalling: [],
  fietsenstallingen_services: [],  
  HelpdeskHandmatigIngesteld: false,
});

export const fietsenstallingLijstSelect = {
  ID: true,
  StallingsID: true,
  Title: true,
  Location: true,
  Plaats: true,
  Capacity: true,
  Status: true,
  Type: true,
  ExploitantID: true,
  SiteID: true,
  Postcode: true,
  Coordinaten: true,
  Image: true,
  Description: true,
  Openingstijden: true,
  Tariefcode: true,
  EditorCreated: true,
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
  uitzonderingenopeningstijden: {
    select: {
      ID: true,
      openingDateTime: true,
      closingDateTime: true,
      fietsenstallingsID: true,
    },
  },
};

export const fietsenstallingSchema = z.object({
  ID: z.string(),
  StallingsID: z.string().max(8).nullable(),
  SiteID: z.string().max(35).nullable(),
  Title: z.string().max(255).nullable(),
  StallingsIDExtern: z.string().max(100).nullable(),
  Description: z.string().nullable(),
  Image: z.string().max(255).nullable(),
  Location: z.string().max(255).nullable(),
  Postcode: z.string().max(7).nullable(),
  Plaats: z.string().max(100).nullable(),
  Capacity: z.number().nullable(),
  Status: z.string().max(4).nullable(),
  Type: z.string().max(15).nullable(),
  Open_ma: z.string().nullable().transform((val) => val ? new Date(val) : null),
  Dicht_ma: z.string().nullable().transform((val) => val ? new Date(val) : null),
  Open_di: z.string().nullable().transform((val) => val ? new Date(val) : null),
  Dicht_di: z.string().nullable().transform((val) => val ? new Date(val) : null),
  Open_wo: z.string().nullable().transform((val) => val ? new Date(val) : null),
  Dicht_wo: z.string().nullable().transform((val) => val ? new Date(val) : null),
  Open_do: z.string().nullable().transform((val) => val ? new Date(val) : null),
  Dicht_do: z.string().nullable().transform((val) => val ? new Date(val) : null),
  Open_vr: z.string().nullable().transform((val) => val ? new Date(val) : null),
  Dicht_vr: z.string().nullable().transform((val) => val ? new Date(val) : null),
  Open_za: z.string().nullable().transform((val) => val ? new Date(val) : null),
  Dicht_za: z.string().nullable().transform((val) => val ? new Date(val) : null),
  Open_zo: z.string().nullable().transform((val) => val ? new Date(val) : null),
  Dicht_zo: z.string().nullable().transform((val) => val ? new Date(val) : null),
  Openingstijden: z.string().nullable(),
  Coordinaten: z
    .string()
    .max(255)
    .nullable()
    .refine((val) => val === null || val === "" || parseLatLng(val) !== undefined, {
      message:
        "Coordinaten moeten worden opgegeven als 'breedtegraad,lengtegraad' in decimale graden, bijvoorbeeld 52.381383,4.628580",
    }),
  EditorCreated: z.string().max(255).nullable(),
  DateCreated: z.string().nullable().transform((val) => val ? new Date(val) : null),
  EditorModified: z.string().max(255).nullable(),
  DateModified: z.string().nullable().transform((val) => val ? new Date(val) : null),
  Ip: z.string().max(24).nullable(),
  Verwijssysteem: z.boolean(),
  VerwijssysteemOverzichten: z.boolean().nullable(),
  FMS: z.boolean(),
  Beheerder: z.string().max(100).nullable(),
  BeheerderContact: z.string().max(255).nullable(),
  OmschrijvingTarieven: z.string().nullable(),
  IsStationsstalling: z.boolean(),
  IsPopup: z.boolean(),
  NotaVerwijssysteem: z.string().nullable(),
  Tariefcode: z.number().nullable(),
  Toegangscontrole: z.number().nullable(),
  Url: z.string().nullable(),
  ExtraServices: z.string().nullable(),
  dia: z.string().nullable(),
  BerekentStallingskosten: z.boolean(),
  AantalReserveerbareKluizen: z.number(),
  MaxStallingsduur: z.number(),
  HeeftExterneBezettingsdata: z.boolean(),
  ExploitantID: z.string().max(35).nullable(),
  hasUniSectionPrices: z.boolean(),
  hasUniBikeTypePrices: z.boolean(),
  shadowBikeparkID: z.string().max(35).nullable(),
  BronBezettingsdata: z.string().max(20).nullable(),
  reservationCostPerDay: z.number().nullable(),
  // wachtlijst_Id: z.bigint().nullable(),
  thirdPartyReservationsUrl: z.string().max(255).nullable(),
  HelpdeskHandmatigIngesteld: z.boolean(),
});

export const fietsenstallingCreateSchema = fietsenstallingSchema
  .partial() // make all fields optional
  .extend({
    StallingsID: z.string().min(1, { message: "StallingsID is verplicht" }).max(8),
    Title: z.string().min(1, { message: "Titel is verplicht" }).max(255),
  }); 