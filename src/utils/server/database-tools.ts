import { type Prisma } from "~/generated/prisma-client";
import { prisma } from "~/server/db";
import type { NextApiRequest } from "next";
import { VSContactItemType } from "~/types/contacts";
import { getSecurityUserNew } from "./security-users-tools";
import { VSUserRoleValuesNew } from "~/types/users";

type ValidationError = {
  error: string;
  status: 401;
};

type ValidationSuccess = {
  sites: string[];
  userId: string;
  activeContactId: string;
};

type ApiResponse<T> = {
  success: boolean;
  result?: T;
  error?: string;
};

// Helper function to generate ID in the correct format
export function generateID() {
  const chars = '0123456789ABCDEF';
  const parts = [
    Array.from({length: 8}, () => chars[Math.floor(Math.random() * 16)]).join(''),
    Array.from({length: 4}, () => chars[Math.floor(Math.random() * 16)]).join(''),
    Array.from({length: 4}, () => chars[Math.floor(Math.random() * 16)]).join(''),
    Array.from({length: 16}, () => chars[Math.floor(Math.random() * 16)]).join('')
  ];
  return `${parts[0]}-${parts[1]}-${parts[2]}-${parts[3]}`;
}

// Helper function to validate user session and get their sites
export async function validateUserSession(session: any, itemType = "organizations"): Promise<ValidationError | ValidationSuccess> {
  if (!session?.user) {
    return { error: "Unauthorized", status: 401 };
  }

  const theuser = await prisma.security_users.findFirst({
    where: {
      UserID: session.user.id
    },
    select: {
      UserID: true,
      user_contact_roles: {
        select: {
          ContactID: true,
          isOwnOrganization: true,
          NewRoleID: true
        }
      }
    }
  });

  if (!theuser) {
    console.error("Unauthorized - no user found");
    return { error: "Unauthorized", status: 401 };
  }

  const data: ValidationSuccess = {
    userId: session.user.id,
    activeContactId: session.user.activeContactId,
    sites: []
  }

  const ownRole = theuser.user_contact_roles.find((role) => role.isOwnOrganization);
  const isAdminFietsberaad = ownRole && ownRole.ContactID === "1" && [VSUserRoleValuesNew.RootAdmin, VSUserRoleValuesNew.Viewer].includes(ownRole.NewRoleID as VSUserRoleValuesNew);

  if(isAdminFietsberaad===false) {
    // get all distinct contact IDs for the user from the user_contact_role table
    const items = await prisma.user_contact_role.findMany({
      where: {
        UserID: session.user.id
      },
      select: {
        ContactID: true
      }
    });
    data.sites = items.map((item) => item.ContactID);
  }
  
  // Fietsberaad rootman: Access to all contacts
  else {
    const allSites = await prisma.contacts.findMany({
      select: {
        ID: true
      }
    });

    data.sites = allSites.map((site) => site.ID);
  }

  return data;
}

// Helper function to get base URL from request
export function getBaseUrl(req: NextApiRequest): string {
  const protocol = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers.host;
  return `${protocol}://${host}`;
}

// Helper function to make API calls
export async function makeApiCall<T>(
  req: NextApiRequest,
  endpoint: string,
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' = 'GET',
  body?: any
): Promise<ApiResponse<T>> {
  try {
    const baseUrl = getBaseUrl(req);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };

    if (req.headers.authorization) {
      headers['Authorization'] = req.headers.authorization;
    }

    if (req.headers.cookie) {
      headers['Cookie'] = req.headers.cookie;
    }

    const response = await fetch(`${baseUrl}${endpoint}`, {
      method,
      headers,
      ...(body && { body: JSON.stringify(body) })
    });

    if (!response.ok) {
      return {
        success: false,
        error: `${response.status} - ${response.statusText}`
      };
    }

    const data = await response.json();
    return {
      success: true,
      result: data
    };
  } catch (error) {
    return {
      success: false,
      error: JSON.stringify(error)
    };
  }
}

// Helper function to update security profile
export async function updateSecurityProfile(session: any, userId: string): Promise<{ session: any; error?: string }> {
  try {
    const updatedUser = await getSecurityUserNew(userId, session.user.activeContactId);

    if (!updatedUser) {
      console.error("Fout bij het ophalen van bijgewerkte gebruikersgegevens");
      return { session, error: "Fout bij het bijwerken van beveiligingsprofiel" };
    }

    // Update session with new security profile
    const updatedSession = {
      ...session,
      user: {
        ...session.user,
        securityProfile: updatedUser.securityProfile
      }
    };

    return { session: updatedSession };
  } catch (error) {
    console.error("Error updating security profile:", error);
    return { session, error: "Fout bij het bijwerken van beveiligingsprofiel" };
  }
} 

export const getOrganisationTypeByID = async (contactID: string)=> {
  return (await prisma.contacts.findFirst({
    where: {
      ID: contactID,
    },
    select: {
      ItemType: true,
    },
  }))?.ItemType || null;
}
