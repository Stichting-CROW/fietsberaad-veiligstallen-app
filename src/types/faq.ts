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
  // EditorCreated: Date,
  // EditorModified: Date,
  DateCreated?: Date,
  DateModified?: Date,
  ModuleID?: string | null,
}

export type VSFaqFull = {
  sectionTitle: string,
  q_and_a: VSFAQ[]
}
