import { type NextApiRequest, type NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "../../auth/[...nextauth]";
import { calculateAuthToken } from "~/utils/token-tools";
import { VSUserRoleValuesNew } from "~/types/users";

export default async function handler(
    req: NextApiRequest,
    res: NextApiResponse
) {
    try {
        // Only allow GET requests
        if (req.method !== 'GET') {
            return res.status(405).json({ error: 'Method not allowed' });
        }

        // Get the current session
        const session = await getServerSession(req, res, authOptions);
        console.log(">>> GETTOKEN SESSION", session?.user?.securityProfile);
        if (!session?.user || session.user.securityProfile?.roleId !== VSUserRoleValuesNew.RootAdmin) {
            return res.status(403).json({ error: "Unauthorized - Root access required" });
        }

        // Get email and contactID from query
        const { UserID } = req.query;

        if (!UserID || Array.isArray(UserID)) {
            return res.status(400).json({ error: "Invalid parameters" });
        }

        // Generate token
        const tokenResponse = calculateAuthToken(UserID);
        if (!tokenResponse) {
            return res.status(500).json({ error: "Failed to generate token" });
        }

        return res.status(200).json(tokenResponse);
    } catch (error) {
        console.error("Error in gettoken handler:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
} 