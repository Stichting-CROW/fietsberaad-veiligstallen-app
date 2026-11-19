import { prisma } from "~/server/db";

export type ReportScope =
  | { kind: "gemeente"; contactId: string; name: string }
  | { kind: "exploitant"; contactId: string; name: string };

/** The active beheer contact decides whose financial data a report shows. */
export const getReportScope = async (contactId: string): Promise<ReportScope | null> => {
  if (!contactId) return null;
  const contact = await prisma.contacts.findUnique({
    where: { ID: contactId },
    select: { ID: true, ItemType: true, CompanyName: true },
  });
  if (!contact) return null;
  const name = contact.CompanyName ?? "";
  if (contact.ItemType === "exploitant") return { kind: "exploitant", contactId: contact.ID, name };
  return { kind: "gemeente", contactId: contact.ID, name };
};
