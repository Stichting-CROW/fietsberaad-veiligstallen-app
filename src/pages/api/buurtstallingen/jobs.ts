import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { env } from "~/env.mjs";
import { expireDue, mailDueWaitingList } from "~/modules/buurtstallingen/application/service";
import { sendBuurtstallingenError } from "~/modules/buurtstallingen/application/http";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.status(405).json({ error: "Methode niet toegestaan" });
    return;
  }
  const header = req.headers.authorization;
  const tokenOk = Boolean(env.BUURTSTALLINGEN_JOB_TOKEN) && header === `Bearer ${env.BUURTSTALLINGEN_JOB_TOKEN}`;
  if (!tokenOk) {
    const session = await getServerSession(req, res, authOptions);
    if (!userHasRight(session?.user?.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
      res.status(401).json({ error: "Niet geautoriseerd" });
      return;
    }
  }
  try {
    const expired = await expireDue();
    const reminded = await mailDueWaitingList();
    res.status(200).json({ expired, reminded });
  } catch (error) {
    sendBuurtstallingenError(res, error);
  }
}
