import type { NextApiRequest, NextApiResponse } from "next";
import { documentPage, logoUrl, renderDocument } from "~/modules/buurtstallingen/domain/documents";
import { code128bSvg } from "~/modules/citizen-accounts/barcode";
import { resolveSubscriptionRef, sessionAccountId, subscriptionConditions, subscriptionDocument } from "~/modules/citizen-accounts/service";
import { prisma } from "~/server/db";

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function dateLabel(value: Date | string | null): string {
  if (!value) return "";
  const date = new Date(value);
  return `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
}

export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  if (req.query.document === "conditions") {
    const conditions = await subscriptionConditions(Number(req.query.subscriptiontypeid));
    if (!conditions) {
      res.status(404).send("<h1>Document niet gevonden</h1>");
      return;
    }
    const body = renderDocument(conditions.html, {
      subscriptionName: conditions.subscriptionName,
      subscriptionPrice: conditions.subscriptionPrice,
      dateLabel: new Date().toLocaleDateString("nl-NL"),
    });
    res.status(200).send(documentPage({
      title: conditions.title,
      body: `<h1>${escapeHtml(conditions.title)}</h1>${body}`,
      logoUrl: logoUrl(conditions.councilLogo),
      logoAlt: conditions.councilName || "Logo",
    }));
    return;
  }
  const accountId = sessionAccountId(req);
  if (!accountId || !req.query.abonnement) {
    res.status(401).send("<p>Log in om verder te gaan</p>");
    return;
  }
  try {
    const subscriptionId = await resolveSubscriptionRef(req.query.abonnement);
    if (subscriptionId === null) throw new Error("not found");
    const doc = await subscriptionDocument(accountId, subscriptionId);
    if (!doc.paid) {
      res.status(409).send("<p>Dit abonnement is nog niet betaald.</p>");
      return;
    }
    const row = await prisma.abonnementen.findUnique({ where: { ID: subscriptionId }, select: { siteID: true, barcode: true } });
    const council = row?.siteID
      ? await prisma.contacts.findUnique({ where: { ID: row.siteID }, select: { CompanyLogo: true } })
      : null;
    const code = doc.pass?.passId ?? "";
    const barcode = doc.pass ? doc.pass.passId.replace(/#/g, "") : row?.barcode ?? "";
    const stallings = doc.stallings.length
      ? `<p>U kunt met dit abonnement bij de volgende stallingen terecht:<ul>${doc.stallings
          .map((stalling) => `<li><strong>${escapeHtml(stalling.title)}</strong> ${escapeHtml(stalling.location)}</li>`)
          .join("")}</ul></p>`
      : "";
    const body = `<p>U heeft het volgende product aangeschaft via de website veiligstallen.nl:</p>
<p>${escapeHtml(doc.name)}</p>
<p>Dit abonnement is geldig tot van ${dateLabel(doc.start)} tot ${dateLabel(doc.end)}.</p>
<p>Druk dit document af en neem het mee naar een van onderstaande fietsenstallingen. De beheerder zal de barcode scannen en daarmee het abonnement koppelen aan een sleutelhanger met barcode. Met deze sleutelhanger kunt u dan voortaan kosteloos stallen bij de aangesloten stallingen.</p>
<p>Bent u al in het bezit van een sleutelhanger van de stalling, neemt u deze dan mee. Het abonnement zal dan aan deze sleutelhanger worden gekoppeld.</p>
<p>Als u geen printer heeft, noteer dan de volgende code: <strong>${escapeHtml(code)}</strong>, en neem deze mee naar de stalling.</p>
${stallings}
<p style="text-align:center">${barcode ? code128bSvg(barcode) : ""}</p>`;
    res.status(200).send(documentPage({
      title: doc.name,
      body,
      logoUrl: logoUrl(council?.CompanyLogo),
      logoAlt: doc.council.name || "Logo",
    }));
  } catch {
    res.status(404).send("<h1>Document niet gevonden</h1>");
  }
}
