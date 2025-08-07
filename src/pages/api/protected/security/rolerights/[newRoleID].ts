import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "../../../auth/[...nextauth]";
import { VSUserRoleValuesNew } from "~/types/users";
import { getRoleRights, type VSUserRoleRights } from "~/utils/securitycontext";

export interface VSUserRoleRightsResult {
    rights: VSUserRoleRights;
}

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    // Only allow GET requests
    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Get the current session
    const session = await getServerSession(req, res, authOptions);
    if (!session?.user) {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    try {
        const { newRoleID } = req.query;

        if (!newRoleID || typeof newRoleID !== 'string') {
            console.error("Invalid role ID", newRoleID);
            return res.status(400).json({ error: 'Invalid role ID' });
        }

        if (!(Object.values(VSUserRoleValuesNew).includes(newRoleID as VSUserRoleValuesNew))) {
            console.error("Invalid role ID", newRoleID);
            return res.status(400).json({ error: 'Invalid role ID' });
        }

        const rights = getRoleRights(newRoleID as VSUserRoleValuesNew);
        return res.status(200).json({ rights });
    } catch (error) {
        console.error('Error fetching user roles:', error);
        return res.status(500).json({ error: 'Error fetching user roles' });
    }
} 