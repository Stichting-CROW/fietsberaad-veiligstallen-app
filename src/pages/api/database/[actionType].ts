import type { NextApiRequest, NextApiResponse } from "next";
import DatabaseService from "~/backend/services/database-service";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method === 'POST') {
    switch (req.query.actionType) {
      case "transactionscache": {
        let params = req.body.databaseParams;

        if (undefined === params) {
          res.status(400).end(); // 400: Bad Request
        }

        const result = await DatabaseService.manageTransactionCache(params);
        res.json(result); // failure is handled in the service
        break;
      }
      case "bezettingencache": {
        let params = req.body.databaseParams;
        if (undefined === params) {
          res.status(400).end(); // 400: Bad Request
        }
        
        const result = await DatabaseService.manageBezettingCache(params);
        res.json(result); // failure is handled in the service
        break;
      }
      default: {
        res.status(405).end(); // Method Not Allowed
      }
    }
  } else {
    res.status(405).end(); // Method Not Allowed
  }
}