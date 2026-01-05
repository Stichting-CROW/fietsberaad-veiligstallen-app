export type VSContactsFAQ = {
  ID: number,
  SiteID: string,
  FaqID: string,
  Status: boolean,
}

export type VSFAQ = {
  ID: string,
  // ArticleID: string,
  ParentID: string,
  Title?: string | null,
  // Description: string,
  Question?: string | null,
  Answer?: string | null,
  SortOrder?: number | null,
  Status?: string | null,
  EditorCreated?: string | null,
  DateCreated?: Date,
  EditorModified?: string | null,
  DateModified?: Date,
  ModuleID?: string | null,
}

export type VSFaqFull = {
  sectionTitle: string,
  q_and_a: VSFAQ[]
}
