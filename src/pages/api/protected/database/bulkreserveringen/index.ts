import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { listAllBulkReservationsAdmin } from "~/server/services/bulk-reservations/service";
import type { AdminBulkReservationRow } from "~/types/bulkreserveringen-admin";

export type BulkreserveringenAdminResponse = {
  data?: AdminBulkReservationRow[];
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse<BulkreserveringenAdminResponse>
) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Niet ingelogd" });
    return;
  }

  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    res.status(403).json({ error: "Alleen fietsberaad superadmin" });
    return;
  }

  try {
    const data = await listAllBulkReservationsAdmin();
    res.status(200).json({ data });
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: "Laden mislukt" });
  }
}
