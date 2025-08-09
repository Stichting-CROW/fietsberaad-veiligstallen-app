import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  const result = await prisma.fietsenstalling_sectie.aggregate({
    _max: {
      sectieId: true
    }
  });

  const data = { sectieId: result._max.sectieId !== null ? result._max.sectieId + 1 : 1 }
  res.json(data);
}
