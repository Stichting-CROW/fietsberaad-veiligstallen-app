import { NextApiRequest, NextApiResponse } from "next";
// import { getServerSession } from "next-auth";
// import { authOptions } from "../../../auth/[...nextauth]";
// import { prisma } from "~/server/db";
// import { createSecurityProfile } from "~/utils/server/securitycontext";
// import { type VSUserWithRoles, securityUserSelect } from "~/types/users-coldfusion";
// import { getOrganisationTypeByID } from "~/utils/server/database-tools";

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    return res.status(405).json({ error: 'Method not allowed' });

    // // Only allow GET requests
    // if (req.method !== 'GET') {
    //     return res.status(405).json({ error: 'Method not allowed' });
    // }

    // // Get the current session
    // const session = await getServerSession(req, res, authOptions);
    // if (!session?.user) {
    //     return res.status(401).json({ error: 'Unauthorized' });
    // }

    // // Check if current user is root
    // const currentUser = await prisma.security_users.findFirst({
    //     where: { 
    //         UserID: session.user.id 
    //     },
    //     select: securityUserSelect
    // }) as VSUserWithRoles | null;

    // if (!currentUser?.security_roles || currentUser.security_roles.Role !== 'root') {
    //     return res.status(403).json({ error: 'Forbidden - Root access required' });
    // }

    // try {
    //     const { userId, activeContactId } = req.query;

    //     if (!userId || typeof userId !== 'string') {
    //         return res.status(400).json({ error: 'User ID is required' });
    //     }

    //     // Get user with roles and sites
    //     const user = await prisma.security_users.findFirst({
    //         where: { 
    //             UserID: userId 
    //         },
    //         select: securityUserSelect
    //     }) as VSUserWithRoles | null;

    //     if (!user) {
    //         return res.status(404).json({ error: 'User not found' });
    //     }

    //     // Create security service instance
    //     // const activeContactIdValue = Array.isArray(activeContactId) ? activeContactId[0] : activeContactId;
    //     const activeContactType = await getOrganisationTypeByID(activeContactId as string);
    //     const securityProfile = createSecurityProfile(
    //         user,
    //         activeContactType
    //     );

    //     return res.status(200).json({ profile: securityProfile });

    // } catch (error) {
    //     console.error('Error fetching security profile:', error);
    //     return res.status(500).json({ error: 'Internal server error' });
    // }
} 