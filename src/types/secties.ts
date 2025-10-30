import type { Prisma } from "~/generated/prisma-client";

export type SectieQualification = "NONE" | "ABOVE";

export type SectieFietstypeType = {
  SectionBiketypeID: number;
  Capaciteit: number | null;
  Toegestaan: boolean | null;
  sectieID: number | null;
  BikeTypeID: number | null;
  fietstype: {
    ID: number;
    Name: string | null;
    naamenkelvoud: string;
  } | null;
};

export type SectieDetailsType = {
  sectieId: number;
  externalId: string | null;
  titel: string;
  omschrijving: string | null;
  capaciteit: number | null;
  kleur: string;
  fietsenstallingsId: string | null;
  qualificatie: string | null;
  isactief: boolean;
  secties_fietstype: SectieFietstypeType[];
};

export const selectSectieDetailsType = {
  sectieId: true,
  externalId: true,
  titel: true,
  omschrijving: true,
  capaciteit: true,
  kleur: true,
  fietsenstallingsId: true,
  isactief: true,
  qualificatie: true,
  secties_fietstype: {
    select: {
      SectionBiketypeID: true,
      Capaciteit: true,
      Toegestaan: true,
      sectieID: true,
      BikeTypeID: true,
      fietstype: {
        select: {
          ID: true,
          Name: true,
          naamenkelvoud: true
        }
      }
    }
  }
} satisfies Prisma.fietsenstalling_sectieSelect;

export type SectiesResponse = {
  data?: SectieDetailsType | SectieDetailsType[];
  error?: string;
};

