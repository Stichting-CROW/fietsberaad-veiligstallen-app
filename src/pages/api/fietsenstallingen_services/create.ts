import { type Prisma } from "~/generated/prisma-client";
import { prisma } from "~/server/db";
import type { NextApiRequest, NextApiResponse } from "next";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if ((req.method as string) !== "POST") return;

  const data: Prisma.fietsenstallingen_servicesCreateManyInput = req.body;
  const createManyResponse = await prisma.fietsenstallingen_services.createMany({
    data
  });

  res.json(createManyResponse)
}
