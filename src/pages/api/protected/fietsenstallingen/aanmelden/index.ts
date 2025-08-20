import type { NextApiRequest, NextApiResponse } from "next";
import { createNewStalling } from "../[id]";

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  switch (req.method) {
    case "POST": {
      // this stub is used for anonymous users to registera new stalling
      try {
        return createNewStalling(req, res, true);
      } catch (e) {
        console.error("Error creating fietsenstalling:", e);
        res.status(500).json({error: "Error creating fietsenstalling"});
      }
    
      break;
    }
    default: {
      res.status(405).json({error: "Method Not Allowed"}); // Method Not Allowed
    }
  }
}