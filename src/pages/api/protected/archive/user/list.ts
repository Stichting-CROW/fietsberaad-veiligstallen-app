import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const session = await getServerSession(req, res, authOptions);
    if (!session) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const archivedUsers = await prisma.user_status.findMany({
            where: { Archived: true },
            select: { UserID: true }
        });

        const archivedUserIds = archivedUsers.map(user => user.UserID);
        return res.status(200).json({ archivedUserIds });
    } catch (error) {
        console.error('Error fetching archived users:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
} 