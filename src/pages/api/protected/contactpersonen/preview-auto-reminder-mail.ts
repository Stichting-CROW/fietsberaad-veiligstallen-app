import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { VSSecurityTopic } from "~/types/securityprofile";
import { userHasRight } from "~/types/utils";
import { getAutoReminderPreview } from "~/utils/server/contactpersonen-reminder-mail";

type ResponseData = {
  data?: {
    to: string;
    subject: string;
    html: string;
    text: string;
    userId: string;
    contactId: string;
  }[];
  error?: string;
};

export default async function handle(req: NextApiRequest, res: NextApiResponse<ResponseData>) {
  if (req.method !== "GET") {
    res.status(405).json({ error: "Method Not Allowed" });
    return;
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const hasSuperadmin = userHasRight(
    session.user.securityProfile,
    VSSecurityTopic.fietsberaad_superadmin
  );
  if (!hasSuperadmin) {
    res.status(403).json({ error: "Forbidden: fietsberaad_superadmin required" });
    return;
  }

  try {
    const data = await getAutoReminderPreview();
    res.status(200).json({ data });
  } catch (e) {
    console.error("preview-auto-reminder-mail - error:", e);
    res.status(500).json({ error: "Failed to build reminder preview" });
  }
}
