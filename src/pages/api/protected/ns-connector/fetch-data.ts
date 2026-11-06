import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '~/pages/api/auth/[...nextauth]';
import { fetchAllNsConnectorData, getNsSubscriptionKey } from '~/server/services/ns-connector/client';
import type { NSFacilityType } from '~/types/ns-connector';

export type NSConnectorResponse = {
  success: boolean;
  fietsenstallingen?: NSFacilityType[];
  fietskluizen?: NSFacilityType[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<NSConnectorResponse>
) {
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  try {
    const subscriptionKey = getNsSubscriptionKey();
    if (!subscriptionKey) {
      res.status(503).json({ success: false, error: 'NS Connector is not configured. NSCONNECTOR_SUBSCRIPTION_KEY is not set.' });
      return;
    }

    const { fietsenstallingen, fietskluizen } = await fetchAllNsConnectorData(subscriptionKey);

    res.status(200).json({
      success: true,
      fietsenstallingen,
      fietskluizen,
    });
  } catch (error) {
    console.error('[NS Connector] Error fetching NS data:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error occurred',
    });
  }
}
