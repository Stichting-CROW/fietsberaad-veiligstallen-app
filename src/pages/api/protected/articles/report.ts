import { NextApiRequest, NextApiResponse } from 'next';
// import { getServerSession } from 'next-auth';
// import { authOptions } from '~/pages/api/auth/[...nextauth]';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  try {
    return res.status(401).json({ success: false, error: 'Unauthorized' });

    /* TODO: implement reports */

    // // Check authentication and authorization
    // const session = await getServerSession(req, res, authOptions);
    
    // if (!session) {
    //   return res.status(401).json({ success: false, error: 'Unauthorized' });
    // }

    // // TODO: Add superadmin check for fietsberaad
    // // This is a stub that will be filled in later

    // const { type } = req.query;

    // if (!type || (type !== 'paginas' && type !== 'faq')) {
    //   return res.status(400).json({ 
    //     success: false, 
    //     error: 'Invalid report type. Must be "paginas" or "faq"' 
    //   });
    // }

    // // For now, return a placeholder response based on the type
    // const result = {
    //   success: true,
    //   message: `${type === 'paginas' ? 'Pagina' : 'FAQ'} report generated successfully`,
    //   data: {
    //     timestamp: new Date().toISOString(),
    //     reportType: type,
    //     status: 'stub_implementation',
    //     note: 'This endpoint will be implemented later',
    //     placeholderData: type === 'paginas' 
    //       ? { pages: [], totalPages: 0, lastUpdated: null }
    //       : { faqs: [], totalFaqs: 0, lastUpdated: null }
    //   }
    // };

    // return res.status(200).json(result);
  } catch (error) {
    console.error('Error in articles report:', error);
    return res.status(500).json({ 
      success: false, 
      error: 'Internal server error' 
    });
  }
}
