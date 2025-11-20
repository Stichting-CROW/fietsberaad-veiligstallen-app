import type { AbonnementsvormenType } from "./parking";

export type VSAbonnementsvorm = AbonnementsvormenType & {
  hasSubscriptions?: boolean; // Calculated field indicating if there are active subscriptions
  biketypes?: Array<{
    ID: number;
    Name: string | null;
  }>;
};

export type VSAbonnementsvormInLijst = {
  ID: number;
  naam: string | null;
  tijdsduur: number | null;
  prijs: number | null;
  bikeparkTypeName: string | null;
  isActief: boolean;
  hasSubscriptions?: boolean;
  allowedBikeTypes?: string[];
};

