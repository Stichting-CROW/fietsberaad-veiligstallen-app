import type { VSmodule } from "./modules";

export type VSmodules_contacts = {
  ModuleID: string;
  SiteID: string;
  module?: VSmodule;
  contact?: {
    ID: string;
    CompanyName: string | null;
    ItemType: string | null;
  };
};

export type VSmodules_contactsCreateInput = {
  ModuleID: string;
  SiteID: string;
};

export type VSmodules_contactsUpdateInput = {
  ModuleID: string;
  SiteID: string;
}; 