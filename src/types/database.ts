import { z } from "zod";
import moment from "moment";
import { VSUserRoleValuesNew } from "./users";
import { type VSContactExploitant, VSContactItemType } from '~/types/contacts';

// Custom validation for the ID format (e.g., 0199B305-F1B5-408D-9D4927EBA0F9A80D)
export const idSchema = z.string().refine(
  (id) => {
    // Check if the ID matches the pattern: XXXX-XXXX-XXXXXXXXXXXXXXXX
    const regex = /^[0-9A-F]{8}-[0-9A-F]{4}-[0-9A-F]{4}-[0-9A-F]{16}$/i;
    return regex.test(id);
  },
  (id)=>({
    message: `ID moet in het formaat XXXXXXXX-XXXX-XXXX-XXXXXXXXXXXXXXXX zijn (hexadecimaal) ${id}`,
  })
);

// Valid item types
export const itemTypeEnum = z.enum(["admin", "dataprovider", "exploitant", "organizations"]);

// Schema for validation
export const exploitantSchema = z.object({
  ID: idSchema,
  CompanyName: z.string().min(1).max(100),
  UrlName: z.string().min(0).max(100),
  ItemType: itemTypeEnum,
  Helpdesk: z.string().nullable().optional(),
  Status: z.string().nullable().optional(),
});
  // DateRegistration: z.union([z.string().datetime(), z.date(), z.null()]).optional(),
  // DateConfirmed: z.union([z.string().datetime(), z.date(), z.null()]).optional(),
  // DateRejected: z.union([z.string().datetime(), z.date(), z.null()]).optional(),

// Schema for Prisma updates
// use partial to allow optional fields
export const exploitantCreateSchema = exploitantSchema.omit({ ID: true });

export const getDefaultNewExploitant = (naam = "Nieuwe exploitant"): VSContactExploitant => { 
  return {
    ID: 'new',
    CompanyName: naam,
    UrlName: "",
    ItemType: VSContactItemType.Exploitant,
    Helpdesk: "",
    Status: "active",
    isManagingContacts: [],
    CompanyLogo: "",
    CompanyLogo2: "",
    ThemeColor1: "#1f99d2",
    ThemeColor2: "#96c11f",
  }
}

// Schema for validation
export const gemeenteSchema = z.object({
  ID: idSchema,
  CompanyName: z.string()
    .min(1, { message: "Bedrijfsnaam is verplicht" })
    .max(100, { message: "Bedrijfsnaam mag maximaal 100 tekens bevatten" }),
  ItemType: itemTypeEnum,
  AlternativeCompanyName: z.string()
    .nullable()
    .optional(),
  UrlName: z.string()
    .nullable()
    .optional(),
  ZipID: z.string()
    .refine(
      (val) => val === undefined || val === null || val.length === 2 || val.length === 4,
      { message: "Postcode moet 2 of 4 tekens lang zijn" }
    )
    .nullable()
    .optional(),
  Gemeentecode: z.number()
    .int({ message: "Gemeentecode moet een geheel getal zijn" })
    .nullable()
    .optional(),
  Helpdesk: z.string()
    .nullable()
    .optional(),
  CompanyLogo: z.string()
    .nullable()
    .optional(),
  CompanyLogo2: z.string()
    .nullable()
    .optional(),
  ThemeColor1: z.string()
    .length(6, { message: "Themakleur 1 moet 6 tekens lang zijn" })
    .regex(/^[0-9a-fA-F]{6}$/, { message: "Themakleur 1 moet een geldige hexadecimale kleurcode zijn" })
    .optional(),
  ThemeColor2: z.string()
    .length(6, { message: "Themakleur 2 moet 6 tekens lang zijn" })
    .regex(/^[0-9a-fA-F]{6}$/, { message: "Themakleur 2 moet een geldige hexadecimale kleurcode zijn" })
    .optional(),
  DayBeginsAt: z.union([z.string().datetime(), z.date()])
    .default(moment().utc().startOf('day').toDate())
    .optional(),
  Coordinaten: z.string()
    .max(100, { message: "Coördinaten mogen maximaal 100 tekens bevatten" })
    .regex(/^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/, { message: "Coördinaten moeten in het formaat 'latitude,longitude' zijn" })
    .optional(),
  Zoom: z.number()
    .int({ message: "Zoom moet een geheel getal zijn" })
    .min(0, { message: "Zoom moet minimaal 0 zijn" })
    .max(22, { message: "Zoom mag maximaal 22 zijn" })
    .optional(),
  Bankrekeningnr: z.string()
    .nullable()
    .optional(),
  PlaatsBank: z.string()
    .nullable()
    .optional(),
  Tnv: z.string()
    .nullable()
    .optional(),
  Notes: z.string()
    .nullable()
    .optional(),
  DateRegistration: z.union([z.string().datetime(), z.date(), z.null()])
    .optional(),
  DateConfirmed: z.union([z.string().datetime(), z.date(), z.null()])
    .optional(),
  DateRejected: z.union([z.string().datetime(), z.date(), z.null()])
    .optional(),
  Status: z.string()
    .nullable()
    .optional(),
});

export const gemeenteCreateSchema = gemeenteSchema.omit({ ID: true });

export const getDefaultNewGemeente = (naam = "Nieuwe gemeente")=> { 
  return {
    ID: 'new',
    CompanyName: naam,
    ItemType: VSContactItemType.Organizations,
    AlternativeCompanyName: "",
    UrlName: "",
    ZipID: "mb",
    Helpdesk: "",
    DayBeginsAt: moment().utc().startOf('day').toDate(),
    Coordinaten: "52.09295124616021, 5.108314829064904",
    Zoom: 12,
    Bankrekeningnr: "",
    PlaatsBank: "",
    Tnv: "",
    Notes: "",
    DateRegistration: moment().toDate(),
    CompanyLogo: "",
    CompanyLogo2: "",
    ThemeColor1: "#1f99d2",
    ThemeColor2: "#96c11f",
    modules_contacts: [],
  }
}

export const dataproviderSchema = z.object({
  ID: idSchema,
  CompanyName: z.string()
    .min(1, { message: "Bedrijfsnaam is verplicht" })
    .max(100, { message: "Bedrijfsnaam mag maximaal 100 tekens bevatten" }),
  ItemType: itemTypeEnum,
  UrlName: z.string()
    .nullable()
    .optional(),
  Password: z.string()
    .nullable()
    .optional(),
  Status: z.string()
    .nullable()
    .optional(),
  DateRegistration: z.union([z.string().datetime(), z.date(), z.null()])
    .optional(),
  DateConfirmed: z.union([z.string().datetime(), z.date(), z.null()])
    .optional(),
  DateRejected: z.union([z.string().datetime(), z.date(), z.null()])
    .optional(),
});

export const dataproviderCreateSchema = dataproviderSchema.omit({ ID: true });

export const getDefaultNewDataprovider = (name: string) => ({
  ID: 'new',
  CompanyName: name,
  ItemType: VSContactItemType.Dataprovider as const,
  UrlName: null,
  Password: null,
  Status: "1",
  DateRegistration: null,
  DateConfirmed: null,
  DateRejected: null,
});

export const getDefaultNewSecurityUser = (name: string) => ({
  ID: 'new',
  UserName: '',
  DisplayName: name,
  RoleID: VSUserRoleValuesNew.None,
  Status: "1",
  Password: null,
  EncryptedPassword: null,
  EncryptedPassword2: null,
});

export const securityuserSchema = z.object({
  UserID: idSchema,
  UserName: z.string()
    .min(1, { message: "Gebruikersnaam is verplicht" })
    .max(100, { message: "Gebruikersnaam mag maximaal 100 tekens bevatten" }),
  DisplayName: z.string()
    .min(1, { message: "Weergavenaam is verplicht" })
    .max(100, { message: "Weergavenaam mag maximaal 100 tekens bevatten" }),
  Status: z.string()
    .nullable()
    .optional(),
  RoleID: z.nativeEnum(VSUserRoleValuesNew)
    .optional(),
  EncryptedPassword: z.string()
    .nullable()
    .optional(),
  EncryptedPassword2: z.string()
    .nullable()
    .optional(),
});

export const contactSchema = z.object({
  ID: idSchema,
  FirstName: z.string()
    .min(1, { message: "Voornaam is verplicht" })
    .max(255, { message: "Voornaam mag maximaal 255 tekens bevatten" }),
  LastName: z.string()
    .min(1, { message: "Achternaam is verplicht" })
    .max(255, { message: "Achternaam mag maximaal 255 tekens bevatten" }),
  ItemType: itemTypeEnum,
  Email1: z.string()
    .email({ message: "Ongeldig e-mailadres" })
    .nullable()
    .optional(),
  Phone1: z.string()
    .nullable()
    .optional(),
  Mobile1: z.string()
    .nullable()
    .optional(),
  JobTitle: z.string()
    .nullable()
    .optional(),
  Notes: z.string()
    .nullable()
    .optional(),
  DateRegistration: z.union([z.string().datetime(), z.date(), z.null()])
    .optional(),
  DateConfirmed: z.union([z.string().datetime(), z.date(), z.null()])
    .optional(),
  DateRejected: z.union([z.string().datetime(), z.date(), z.null()])
    .optional(),
  CompanyLogo: z.string()
    .nullable()
    .optional(),
  CompanyLogo2: z.string()
    .nullable()
    .optional(),
});

export const contactCreateSchema = contactSchema.omit({ ID: true });

export const getDefaultNewContact = (naam = "Nieuw contact") => {
  const [firstName, ...lastNameParts] = naam.split(' ');
  const lastName = lastNameParts.join(' ');
  
  return {
    ID: 'new',
    FirstName: firstName,
    LastName: lastName,
    ItemType: "contacts",
    Email1: null,
    Phone1: null,
    Mobile1: null,
    JobTitle: null,
    Notes: null,
    DateRegistration: moment().toDate(),
    DateConfirmed: null,
    DateRejected: null,
    CompanyLogo: null,
    CompanyLogo2: null,
  }
};