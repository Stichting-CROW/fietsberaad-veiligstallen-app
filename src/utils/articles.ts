import { type VSArticle } from "~/types/articles";

export const hasContent = (x: VSArticle) => ((x.Article||"") !== "") || ((x.Abstract||"") !== "");

