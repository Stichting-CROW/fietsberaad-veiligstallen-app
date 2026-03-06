import { z } from "zod";

/** DB enum: sleutelhanger | sticker */
export type BarcodereeksType = "sleutelhanger" | "sticker";

/** API list item: BigInt fields as string for JSON */
export interface VSBarcodereeksApi {
  ID: number;
  parentID: number | null;
  type: BarcodereeksType;
  rangeStart: string;
  rangeEnd: string;
  label: string | null;
  material: string | null;
  printSample: string | null;
  published: string | null;
  created: string | null;
  totaal: number;
  uitgegeven: number;
}

const barcodereeksTypeSchema = z.enum(["sleutelhanger", "sticker"]);

/** String or number for BigInt in JSON */
const bigIntLikeSchema = z.union([
  z.string().refine((s) => /^\d+$/.test(s), "Moet een positief geheel getal zijn"),
  z.number().int().nonnegative(),
]);

/** Create new series (no parent) */
export const barcodereeksCreateSchema = z.object({
  type: barcodereeksTypeSchema,
  label: z.string().max(100).nullable().optional(),
  material: z.string().max(100).nullable().optional(),
  printSample: z.string().max(255).nullable().optional(),
  rangeStart: bigIntLikeSchema,
  rangeEnd: bigIntLikeSchema,
});

/** Issue from existing stock: parentID + amount, or parentID + rangeStart + rangeEnd */
export const barcodereeksUitgifteSchema = z.object({
  type: barcodereeksTypeSchema,
  parentID: z.number().int().positive(),
  amount: z.number().int().positive("Aantal passen moet groter zijn dan 0").optional(),
  rangeStart: bigIntLikeSchema.optional(),
  rangeEnd: bigIntLikeSchema.optional(),
  label: z.string().max(100).nullable().optional(),
  material: z.string().max(100).nullable().optional(),
  printSample: z.string().max(255).nullable().optional(),
});

/** Update existing series */
export const barcodereeksUpdateSchema = z.object({
  label: z.string().max(100).nullable().optional(),
  material: z.string().max(100).nullable().optional(),
  printSample: z.string().max(255).nullable().optional(),
  rangeStart: bigIntLikeSchema.optional(),
  rangeEnd: bigIntLikeSchema.optional(),
});

export type BarcodereeksCreateInput = z.infer<typeof barcodereeksCreateSchema>;
export type BarcodereeksUitgifteInput = z.infer<typeof barcodereeksUitgifteSchema>;
export type BarcodereeksUpdateInput = z.infer<typeof barcodereeksUpdateSchema>;
