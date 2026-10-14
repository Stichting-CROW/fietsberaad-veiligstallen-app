import type { NextApiRequest, NextApiResponse } from "next";
import {
  getBikeparkByExternalId,
  listFmsCouncilsForVerwijssysteem,
  resolveCouncilByUrlOrName,
} from "~/server/display/council";
import { renderDocument, displayNoStoreHeaders } from "~/server/display/render";
import {
  VerwijssysteemGemeentenPage,
  VerwijssysteemSectiesPage,
  VerwijssysteemStallingenPage,
  verwijssysteemHead,
} from "~/server/display/verwijssysteem-html";
import { prisma } from "~/server/db";

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).end();
  }

  const segments = (req.query.path as string[] | undefined) ?? [];
  const slug = segments[0];
  const stallingsId = segments[1];

  try {
    if (!slug) {
      const councils = await listFmsCouncilsForVerwijssysteem();
      const html = renderDocument(
        "Veiligstallen | Verwijssysteem",
        verwijssysteemHead(null, "Verwijssysteem"),
        <VerwijssysteemGemeentenPage councils={councils} />
      );
      Object.entries(displayNoStoreHeaders()).forEach(([k, v]) => res.setHeader(k, v));
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(html);
    }

    const council = await resolveCouncilByUrlOrName(slug);
    if (!council) {
      return res.status(404).send("Gemeente niet gevonden");
    }

    if (stallingsId) {
      const bikepark = await getBikeparkByExternalId(council.id, stallingsId);
      if (!bikepark) return res.status(404).send("Stalling niet gevonden");

      const n = bikepark.fietsenstalling_secties.length;
      const itemClass = n >= 3 ? "small" : "big";
      const itemHeightCss =
        itemClass === "small" ? `calc(90% / ${Math.ceil(n / 2)})` : `calc(90% / ${Math.max(n, 1)})`;

      const html = renderDocument(
        "Veiligstallen | Verwijssysteem",
        verwijssysteemHead(council, "Secties"),
        <VerwijssysteemSectiesPage
          council={council}
          itemClass={itemClass}
          itemHeightCss={itemHeightCss}
          bikeparkId={bikepark.ID}
          sections={bikepark.fietsenstalling_secties.map((s) => ({
            id: s.sectieId,
            color: s.kleur,
            name: s.titel,
            note: s.NotaVerwijssysteem ?? "",
          }))}
        />
      );
      Object.entries(displayNoStoreHeaders()).forEach(([k, v]) => res.setHeader(k, v));
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      return res.status(200).send(html);
    }

    const bikeparks = await prisma.fietsenstallingen.findMany({
      where: { SiteID: council.id, Status: "1", Verwijssysteem: true },
      select: { ID: true, Title: true, NotaVerwijssysteem: true },
      orderBy: { Title: "asc" },
    });
    const count = bikeparks.length;
    const itemClass = count >= 3 ? "small" : "big";
    const itemHeightCss =
      itemClass === "small" ? `calc(90% / ${Math.ceil(count / 2)})` : `calc(90% / ${Math.max(count, 1)})`;

    const html = renderDocument(
      "Veiligstallen | Verwijssysteem",
      verwijssysteemHead(council, "Stallingen"),
      <VerwijssysteemStallingenPage
        council={council}
        title="Aantal vrije plaatsen in fietsenstallingen"
        itemClass={itemClass}
        itemHeightCss={itemHeightCss}
        siteId={council.id}
        rows={bikeparks.map((b) => ({
          id: b.ID,
          title: b.Title ?? "",
          note: b.NotaVerwijssysteem ?? "",
        }))}
      />
    );
    Object.entries(displayNoStoreHeaders()).forEach(([k, v]) => res.setHeader(k, v));
    res.setHeader("Content-Type", "text/html; charset=utf-8");
    return res.status(200).send(html);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return res.status(500).send(message);
  }
}
