import { type DefaultSession, type NextAuthOptions as OriginalNextAuthOptions, type RequestInternal as OriginalRequestInternal } from "next-auth";
import { type VSUserSecurityProfile } from "~/types/securityprofile";

declare module "next-auth" {
  export type ISODateString = string

  interface User extends DefaultSession["user"] {
    id: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
    mainContactId?: string | null;
    activeContactId?: string | null;  
    securityProfile?: VSUserSecurityProfile;
  } 

  interface Session {
    expires: ISODateString
    user: User; // overwrite the user type
  }

  // Re-export the original NextAuthOptions
  export type NextAuthOptions = OriginalNextAuthOptions;

  export type RequestInternal = OriginalRequestInternal;

  export type NextAuthOptions = OriginalNextAuthOptions;

  export function NextAuth(options: NextAuthOptions): NextAuthOptions;
}

