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

    const { userId } = req.query;
    if (!userId || Array.isArray(userId)) {
        return res.status(400).json({ error: 'Invalid user ID' });
    }

    try {
        const userStatus = await prisma.user_status.findUnique({
            where: { UserID: userId }
        });

        return res.status(200).json({ archived: userStatus?.Archived || false });
    } catch (error) {
        console.error('Error fetching archive status:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
} 