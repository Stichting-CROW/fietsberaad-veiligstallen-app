import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '~/pages/api/auth/[...nextauth]';
import { env } from '~/env.mjs';

export type NSConnectorAvailableResponse = {
  available: boolean;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<NSConnectorAvailableResponse>
) {
  // Only allow GET requests
  if (req.method !== 'GET') {
    res.status(405).json({ available: false });
    return;
  }

  // Check authentication
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ available: false });
    return;
  }

  // Check if subscription key is configured
  const available = !!env.NSCONNECTOR_SUBSCRIPTION_KEY;
  res.status(200).json({ available });
}

