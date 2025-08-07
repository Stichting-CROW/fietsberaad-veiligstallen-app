import type { VSContact } from "~/types/contacts";

export const getOrganisationByID = (organisations: VSContact[], id: string): VSContact | undefined => {
  return organisations.find((organisation: VSContact) => organisation.ID === id);
};
