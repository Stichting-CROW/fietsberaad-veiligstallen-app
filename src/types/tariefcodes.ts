import { z } from "zod";
import type { tariefcodes } from "~/generated/prisma-client";

export type VSTariefcode = Pick<tariefcodes, "ID" | "Omschrijving">;

export type VSTariefcodeLijst = Pick<tariefcodes, "ID" | "Omschrijving">;

export const tariefcodeSelect = {
  ID: true,
  Omschrijving: true,
};

export const tariefcodeLijstSelect = {
  ID: true,
  Omschrijving: true,
};

// Schema for validation
export const tariefcodeSchema = z.object({
  ID: z.number().int().positive(),
  Omschrijving: z.string().min(1, { message: "Omschrijving is verplicht" }).max(100, { message: "Omschrijving mag maximaal 100 tekens bevatten" }),
});

// Schema for creating new tariefcode (omit ID as it's auto-generated)
export const tariefcodeCreateSchema = tariefcodeSchema.omit({ ID: true });

// Schema for updating tariefcode (all fields optional except ID)
export const tariefcodeUpdateSchema = tariefcodeSchema.partial().extend({
  ID: z.number().int().positive(),
});

