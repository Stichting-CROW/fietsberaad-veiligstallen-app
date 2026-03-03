import { z } from "zod";
import { idSchema } from "./database";

// Legacy fields are commented out and not used in the new schema
export type VSArticle = {
  ID: string;
  SiteID?: string | null;
  // Language?: string | null;
  //ParentID?: string | null;
  Title: string | null;
  DisplayTitle?: string | null;
  Abstract?: string | null;
  Article?: string | null;
  // CustomField1_Title?: string | null;
  // CustomField1?: string | null;
  // Banner?: string | null;
  //Keywords?: string | null;
  SortOrder?: number | null;
  // PublishStartDate?: Date | string | null;
  // PublishEndDate?: Date | string | null;
  Status: string;
  Navigation?: string | null;
  // ShowInNav?: string | null;
  Archived?: string | null;
  UsedInColdfusion?: string | null;
  System?: string | null;
  EditorCreated?: string | null;
  DateCreated: Date | string | null;
  EditorModified?: string | null;
  DateModified?: Date | string | null;
  ModuleID: string;
}

export type VSArticleInLijst = {
  ID: string;
  Title: string | null;
  DisplayTitle?: string | null;
  Abstract?: string | null;
  // Banner?: string | null;
  Keywords?: string | null;
  // PublishStartDate?: Date | string | null;
  // PublishEndDate?: Date | string | null;
  Status: string;
  Navigation?: string | null;
  // ShowInNav?: string | null;
  DateCreated: Date | string | null;
  DateModified?: Date | string | null;
}

export const articleSelect = {
  ID: true,
  SiteID: true,
  // Language: true,
  // ParentID: true,
  Title: true,
  DisplayTitle: true,
  Abstract: true,
  Article: true,
  // CustomField1_Title: true,
  // CustomField1: true,
  // Banner: true,
  Keywords: true,
  SortOrder: true,
  // PublishStartDate: true,
  // PublishEndDate: true,
  Status: true,
  Navigation: true,
  // ShowInNav: true,
  Archived: true,
  UsedInColdfusion: true,
  System: true,
  EditorCreated: true,
  DateCreated: true,
  EditorModified: true,
  DateModified: true,
  ModuleID: true
}

export const articleLijstSelect = {
  ID: true,
  Title: true,
  DisplayTitle: true,
  Abstract: true,
  // Banner: true,
  Keywords: true,
  // PublishStartDate: true,
  // PublishEndDate: true,
  Status: true,
  Navigation: true,
  // ShowInNav: true,
  DateCreated: true,
  DateModified: true
}

// Legacy fields are commented out and not used in the new schema
export const articleSchema = z.object({
  ID: idSchema,
  SiteID: z.string().nullable().optional(),
  // Legacy fields are commented out
  // Language: z.string().nullable().optional(),
  // ParentID: z.string().nullable().optional(),
  Title: z.string()
    .min(1, { message: "Title is required" })
    .max(100, { message: "Title must be at most 100 characters" })
    .nullable(),
  DisplayTitle: z.string()
    .max(100, { message: "Display title must be at most 100 characters" })
    .nullable()
    .optional(),
  Abstract: z.string()
    .nullable()
    .optional(),
  Article: z.string()
    .nullable()
    .optional(),
  // CustomField1_Title: z.string()
  //   .max(255, { message: "Custom field 1 title must be at most 255 characters" })
  //   .nullable()
  //   .optional(),
  // CustomField1: z.string()
  //   .nullable()
  //   .optional(),
  // // Legacy fields are commented out
  // Banner: z.string()
  //   .max(255, { message: "Banner must be at most 255 characters" })
  //   .nullable()
  //   .optional(),
  // Keywords: z.string()
  //   .nullable()
  //   .optional(),
  SortOrder: z.number()
    .int()
    .nullable()
    .optional(),
  // PublishStartDate: z.string()
  //   .nullable()
  //   .optional(),
  // PublishEndDate: z.string()
  //   .nullable()
  //   .optional(),
  Status: z.string()
    .default("1"),
  Navigation: z.string()
    .max(50, { message: "Navigation must be at most 50 characters" })
    .nullable()
    .optional(),
  // ShowInNav: z.string()
  //   .max(4, { message: "Show in nav must be at most 4 characters" })
  //   .nullable()
  //   .optional(),
  Archived: z.string()
    .max(4, { message: "Archived must be at most 4 characters" })
    .default("0")
    .nullable()
    .optional(),
  UsedInColdfusion: z.string()
    .max(4, { message: "UsedInColdfusion must be at most 4 characters" })
    .default("0")
    .nullable()
    .optional(),
  System: z.string()
    .max(4, { message: "System must be at most 4 characters" })
    .default("0")
    .optional(),
  EditorCreated: z.string()
    .max(255, { message: "Editor created must be at most 255 characters" })
    .nullable()
    .optional(),
  DateCreated: z.string()
    .nullable(),
  EditorModified: z.string()
    .max(255, { message: "Editor modified must be at most 255 characters" })
    .nullable()
    .optional(),
  DateModified: z.string()
    .nullable()
    .optional(),
  ModuleID: z.string()
    .default("veiligstallenprisma")
});

export const articleCreateSchema = articleSchema.omit({ ID: true });

export const getDefaultNewArticle = (title = "New Article") => {
  return {
    ID: 'new',
    Title: title,
    DisplayTitle: title,
    Abstract: null,
    Article: null,
    // CustomField1_Title: null,
    // CustomField1: null,
    // Banner: null,
    // Keywords: null,
    SortOrder: null,
    // PublishStartDate: null,
    // PublishEndDate: null,
    Status: "1",
    Navigation: null,
    // ShowInNav: null,
    Archived: "0",
    UsedInColdfusion: "0",
    System: "0",
    EditorCreated: null,
    DateCreated: new Date(),
    EditorModified: null,
    DateModified: null,
    ModuleID: "veiligstallenprisma"
  }
}

