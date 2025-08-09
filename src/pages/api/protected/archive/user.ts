import { type NextApiRequest, type NextApiResponse } from 'next';
import { getServerSession } from 'next-auth';
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { prisma } from '~/server/db';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const session = await getServerSession(req, res, authOptions);

  if (!session) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { userId, archived } = req.body;

    if (!userId || typeof archived !== 'boolean') {
      return res.status(400).json({ error: 'Invalid request body' });
    }

    // Check if the user exists
    const user = await prisma.security_users.findUnique({
      where: { UserID: userId },
    });

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    if (archived) {
      // Create or update the user status to archived
      const userStatus = await prisma.user_status.upsert({
        where: { UserID: userId },
        update: { Archived: true },
        create: {
          UserID: userId,
          Archived: true,
        },
      });
      return res.status(200).json(userStatus);
    } else {
      // Delete the user status record when unarchiving
      await prisma.user_status.delete({
        where: { UserID: userId },
      });
      return res.status(200).json({ message: 'User unarchived successfully' });
    }
  } catch (error) {
    console.error('Error updating user archive status:', error);
    return res.status(500).json({ error: 'Internal server error' });
  }
} 