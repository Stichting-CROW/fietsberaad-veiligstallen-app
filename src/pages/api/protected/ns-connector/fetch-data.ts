import type { NextApiRequest, NextApiResponse } from 'next';
import { getServerSession } from 'next-auth/next';
import { authOptions } from '~/pages/api/auth/[...nextauth]';
import { env } from '~/env.mjs';
import * as fs from 'fs';
import * as path from 'path';
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
  // Only allow POST requests
  if (req.method !== 'POST') {
    res.status(405).json({ success: false, error: 'Method not allowed' });
    return;
  }

  // Check authentication
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }

  try {
    const subscriptionKey = env.NSCONNECTOR_SUBSCRIPTION_KEY;
    if (!subscriptionKey) {
      res.status(503).json({ success: false, error: 'NS Connector is not configured. NSCONNECTOR_SUBSCRIPTION_KEY is not set.' });
      return;
    }

    const endpoint = 'https://gateway.apiportal.ns.nl/places-api/v2/places';

    // Fetch fietsenstallingen
    const stallingenParams = new URLSearchParams({
      type: 'stationfacility',
      radius: '1000',
      identifier: 'fietsenstalling',
      limit: '250',
    });

    const stallingenResponse = await fetch(`${endpoint}?${stallingenParams.toString()}`, {
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': subscriptionKey,
      },
    });

    if (!stallingenResponse.ok) {
      throw new Error(`Fietsenstallingen API error: ${stallingenResponse.status} ${stallingenResponse.statusText}`);
    }

    const stallingenData = await stallingenResponse.json();

    // Fetch fietskluizen
    const fietskluizenParams = new URLSearchParams({
      type: 'stationfacility',
      radius: '1000',
      name: 'fietskluis',
      limit: '250',
    });

    const fietskluizenResponse = await fetch(`${endpoint}?${fietskluizenParams.toString()}`, {
      method: 'GET',
      headers: {
        'Ocp-Apim-Subscription-Key': subscriptionKey,
      },
    });

    if (!fietskluizenResponse.ok) {
      throw new Error(`Fietskluizen API error: ${fietskluizenResponse.status} ${fietskluizenResponse.statusText}`);
    }

    const fietskluizenData = await fietskluizenResponse.json();

    // Log the responses to temporary files
    const tmpDir = '/tmp';
    const stallingenLogPath = path.join(tmpDir, 'ns-fietsenstallingen-response.json');
    const fietskluizenLogPath = path.join(tmpDir, 'ns-fietskluizen-response.json');

    try {
      fs.writeFileSync(stallingenLogPath, JSON.stringify(stallingenData, null, 2), 'utf-8');
      fs.writeFileSync(fietskluizenLogPath, JSON.stringify(fietskluizenData, null, 2), 'utf-8');
      console.log(`[NS Connector] Logged fietsenstallingen response to ${stallingenLogPath}`);
      console.log(`[NS Connector] Logged fietskluizen response to ${fietskluizenLogPath}`);
    } catch (writeError) {
      console.error('[NS Connector] Error writing log files:', writeError);
      // Continue even if logging fails
    }

    // Extract payload from responses (based on the ColdFusion code structure)
    const fietsenstallingen: NSFacilityType[] = Array.isArray(stallingenData.payload) 
      ? stallingenData.payload 
      : Array.isArray(stallingenData) 
        ? stallingenData 
        : [];
    
    const fietskluizen: NSFacilityType[] = Array.isArray(fietskluizenData.payload) 
      ? fietskluizenData.payload 
      : Array.isArray(fietskluizenData) 
        ? fietskluizenData 
        : [];

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

