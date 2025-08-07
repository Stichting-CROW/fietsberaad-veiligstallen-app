import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { type VSUserWithRoles, type VSUserWithRolesNew, securityUserChangePasswordSelect } from "~/types/users";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { z } from "zod";
import { generateID, validateUserSession } from "~/utils/server/database-tools";
import { convertToNewUser } from "~/pages/api/protected/security_users";
// TODO: implement filtering on accessible security_users

export type SecurityUserChangePasswordResponse = {
  data?: VSUserWithRolesNew;
  error?: string;
};

const securityUserChangePasswordPasswordUpdateSchema = z.object({
  hashedpassword: z.string(),
});

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<SecurityUserChangePasswordResponse>
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({error: "Unauthorized - no session found"});
    return;
  }

  const validateUserSessionResult = await validateUserSession(session, "any");
  if ('error' in validateUserSessionResult) {
    res.status(401).json({error: validateUserSessionResult.error});
    return;
  }

  const id = req.query.id as string;
  const activeContactId = session.user.activeContactId;

  switch (req.method) {
    case "POST": {
      try {
        const parseResult = securityUserChangePasswordPasswordUpdateSchema.safeParse(req.body);
        if (!parseResult.success) {
          console.error("Unexpected/missing data error:", parseResult.error);
          res.status(400).json({ error: "Unexpected/missing data error:" });
          return;
        }
        const parsed = parseResult.data;

        const updatedUser = await prisma.security_users.update({
          where: { UserID: id },
          data: {
            EncryptedPassword: parsed.hashedpassword,
            EncryptedPassword2: parsed.hashedpassword,
          },
          select: securityUserChangePasswordSelect
        }) as VSUserWithRoles;

        const newUser = await convertToNewUser(updatedUser, activeContactId);
        res.status(201).json({ data: newUser });
      } catch (e) {
        console.error("Error updating security user:", e);
        res.status(500).json({error: "Error updating security user"});
      }
      break;
    }
    case "DELETE": {
      try {
        await prisma.security_users.update({
          where: { UserID: id },
          data: {
            EncryptedPassword: null,
            EncryptedPassword2: null,
          }
        });
        res.status(200).json({});
      } catch (e) {
        console.error("Error deleting security user:", e);
        res.status(500).json({error: "Error deleting security user"});
      }
      break;
    }
    default: {
      res.status(405).json({error: "Method Not Allowed"});
    }
  }
} 