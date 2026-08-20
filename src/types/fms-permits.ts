import { z } from "zod";

/** ColdFusion application.domvalues.permittypes (DomainValues.cfm) */
export const FMS_PERMIT_TYPES = [
  { name: "operator", label: "Operator (alle rechten)" },
  { name: "dataprovider.type1", label: "Checkins + checkouts + bezettingsdata" },
  { name: "dataprovider.type2", label: "Afgeronde transacties + bezettingsdata" },
] as const;

export type FmsPermitTypeName = (typeof FMS_PERMIT_TYPES)[number]["name"];

export type VSFmsServicePermitRow = {
  ID: number;
  Permit: string | null;
  OperatorID: string | null;
  SiteID: string | null;
  BikeparkID: string | null;
  operatorName: string | null;
  gemeenteName: string | null;
  locationLabel: string | null;
  stallingsID: string | null;
  parkingTypeId: string | null;
  parkingTypeName: string | null;
  /** null = gemeente-brede permit (geen enkele stalling) */
  fms: boolean | null;
};

export type VSFmsMissingCoupling = {
  stallingsID: string | null;
  title: string | null;
  plaats: string | null;
  gemeenteName: string | null;
  siteID: string | null;
  parkingTypeId: string | null;
  parkingTypeName: string | null;
  fms: boolean;
};

export type VSFmsPermitEditorData = {
  permits: VSFmsServicePermitRow[];
  dataproviders: Array<{ ID: string; CompanyName: string | null }>;
  fmsBikeparks: Array<{
    ID: string;
    StallingsID: string | null;
    Title: string | null;
  }>;
  gemeenteName: string | null;
};

export const fmsPermitCreateSchema = z.object({
  operatorID: z.string().min(1),
  siteID: z.string().min(1),
  bikeparkID: z.string().nullable().optional(),
  permitTypes: z.array(z.string()).default([]),
});

export const fmsPermitUpdateSchema = z.object({
  permitTypes: z.array(z.string()).default([]),
});

export function parsePermitTypes(permit: string | null | undefined): string[] {
  if (!permit?.trim()) return [];
  return permit.split(",").map((s) => s.trim()).filter(Boolean);
}

export function formatPermitTypes(types: string[]): string {
  return types.filter(Boolean).join(",");
}

export function permitTypeIsChecked(
  permit: string | null | undefined,
  typeName: string
): boolean {
  return parsePermitTypes(permit).includes(typeName);
}
