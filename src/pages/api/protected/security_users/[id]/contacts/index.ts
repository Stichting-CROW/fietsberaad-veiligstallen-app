import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth/next";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from "~/server/db";

export interface UserContactResponse {
    relatedContacts: {
        ContactID: string;
        isOwnOrganization: boolean;
    }[];
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    if (req.method !== 'GET') {
        console.error('Method not allowed');
        return res.status(405).json({ error: 'Method not allowed' });
    }

    const session = await getServerSession(req, res, authOptions);
    if (!session) {
        console.error('Unauthorized');
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { id } = req.query;
    if (!id || Array.isArray(id)) {
        console.error('Invalid user ID');
        return res.status(400).json({ error: 'Invalid user ID' });
    }

    try {
        const relatedContacts = await prisma.user_contact_role.findMany({
            where: { UserID: id },
            select: {
                ContactID: true,
                isOwnOrganization: true,
            },
            distinct: ['ContactID', 'isOwnOrganization']
        });

        if (!relatedContacts) {
            console.error('Failed to fetch related contacts');
            return res.status(404).json({ error: 'Failed to fetch related contacts' });
        }

        return res.status(200).json({ relatedContacts });
    } catch (error) {
        console.error('Error fetching related contacts:', error);
        return res.status(500).json({ error: 'Internal server error' });
    }
} 