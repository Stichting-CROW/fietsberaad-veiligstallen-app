import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
import { prisma } from "~/server/db";
import { generateID } from "~/utils/server/database-tools";
import { TESTGEMEENTE_NAME } from "~/data/testgemeente-data";

/**
 * Clone an existing stalling into testgemeente. Layout only, no transaction data.
 * Body: { sourceStallingId: string, title: string }
 * Fietsberaad superadmin only.
 */
export default async function handle(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ message: "Method not allowed" });
  }

  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ message: "Niet ingelogd" });
  }
  if (!userHasRight(session.user.securityProfile, VSSecurityTopic.fietsberaad_superadmin)) {
    return res.status(403).json({ message: "Geen rechten" });
  }

  const body = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body ?? {};
  const { sourceStallingId, title } = body;
  if (!sourceStallingId || !title || typeof title !== "string") {
    return res.status(400).json({ message: "sourceStallingId en title zijn verplicht" });
  }

  const contact = await prisma.contacts.findFirst({
    where: { CompanyName: TESTGEMEENTE_NAME, ItemType: "organizations", Status: "1" },
    select: { ID: true },
  });
  if (!contact) {
    return res.status(400).json({ message: "Testgemeente niet gevonden. Maak eerst de testgemeente aan." });
  }

  const source = await prisma.fietsenstallingen.findFirst({
    where: { ID: sourceStallingId, Status: "1" },
    include: {
      fietsenstalling_secties: {
        include: {
          secties_fietstype: true,
        },
      },
      fietsenstallingen_services: true,
      abonnementsvorm_fietsenstalling: true,
      uitzonderingenopeningstijden: true,
    },
  });

  if (!source) {
    return res.status(404).json({ message: "Bronstalling niet gevonden" });
  }

  const [kostenperioden, plekken, tariefregels, winkansen] = await Promise.all([
    prisma.fietsenstalling_sectie_kostenperioden.findMany({
      where: {
        sectieId: { in: source.fietsenstalling_secties.map((s) => s.sectieId) },
      },
    }),
    prisma.fietsenstalling_plek.findMany({
      where: {
        sectie_id: { in: source.fietsenstalling_secties.map((s) => BigInt(s.sectieId)) },
      },
    }),
    prisma.tariefregels.findMany({
      where: { stallingsID: source.ID },
    }),
    prisma.fietsenstallingen_winkansen.findMany({
      where: { FietsenstallingID: source.ID },
    }),
  ]);

  const existingStallings = await prisma.fietsenstallingen.findMany({
    where: { SiteID: contact.ID, StallingsID: { startsWith: "9933_" } },
    select: { StallingsID: true },
  });
  const maxIndex = existingStallings.reduce((max, s) => {
    const m = s.StallingsID?.match(/^9933_(\d+)$/);
    return m ? Math.max(max, parseInt(m[1]!, 10)) : max;
  }, 0);
  const newStallingsID = `9933_${String(maxIndex + 1).padStart(3, "0")}`;
  const newStallingId = generateID();

  await prisma.$transaction(async (tx) => {
    await tx.fietsenstallingen.create({
      data: {
        ID: newStallingId,
        StallingsID: newStallingsID,
        StallingsIDExtern: newStallingsID,
        SiteID: contact.ID,
        Title: title.trim(),
        Description: source.Description,
        Image: source.Image,
        Location: source.Location,
        Postcode: source.Postcode,
        Plaats: source.Plaats,
        Capacity: source.Capacity,
        Openingstijden: source.Openingstijden,
        Status: source.Status,
        Ip: source.Ip,
        Coordinaten: source.Coordinaten,
        Type: source.Type,
        Verwijssysteem: source.Verwijssysteem,
        VerwijssysteemOverzichten: source.VerwijssysteemOverzichten,
        FMS: source.FMS,
        Open_ma: source.Open_ma,
        Dicht_ma: source.Dicht_ma,
        Open_di: source.Open_di,
        Dicht_di: source.Dicht_di,
        Open_wo: source.Open_wo,
        Dicht_wo: source.Dicht_wo,
        Open_do: source.Open_do,
        Dicht_do: source.Dicht_do,
        Open_vr: source.Open_vr,
        Dicht_vr: source.Dicht_vr,
        Open_za: source.Open_za,
        Dicht_za: source.Dicht_za,
        Open_zo: source.Open_zo,
        Dicht_zo: source.Dicht_zo,
        OmschrijvingTarieven: source.OmschrijvingTarieven,
        IsStationsstalling: source.IsStationsstalling,
        IsPopup: source.IsPopup,
        NotaVerwijssysteem: source.NotaVerwijssysteem,
        Tariefcode: source.Tariefcode,
        Toegangscontrole: source.Toegangscontrole,
        Beheerder: source.Beheerder,
        BeheerderContact: source.BeheerderContact,
        HelpdeskHandmatigIngesteld: source.HelpdeskHandmatigIngesteld,
        Url: source.Url,
        ExtraServices: source.ExtraServices,
        dia: source.dia,
        BerekentStallingskosten: false,
        AantalReserveerbareKluizen: source.AantalReserveerbareKluizen,
        MaxStallingsduur: source.MaxStallingsduur,
        HeeftExterneBezettingsdata: source.HeeftExterneBezettingsdata,
        hasUniSectionPrices: source.hasUniSectionPrices,
        hasUniBikeTypePrices: source.hasUniBikeTypePrices,
        shadowBikeparkID: source.shadowBikeparkID,
        BronBezettingsdata: source.BronBezettingsdata,
        reservationCostPerDay: source.reservationCostPerDay,
        thirdPartyReservationsUrl: source.thirdPartyReservationsUrl,
      },
    });

    const sectieIdMap = new Map<number, number>();
    const sectieBikeTypeMap = new Map<number, Map<number, number>>();

    for (let si = 0; si < source.fietsenstalling_secties.length; si++) {
      const sec = source.fietsenstalling_secties[si]!;
      const sectieCreated = await tx.fietsenstalling_sectie.create({
        data: {
          externalId: `${newStallingsID}_${si + 1}`,
          titel: sec.titel,
          omschrijving: sec.omschrijving ?? "",
          capaciteit: sec.capaciteit,
          CapaciteitBromfiets: sec.CapaciteitBromfiets,
          kleur: sec.kleur,
          fietsenstallingsId: newStallingId,
          isKluis: sec.isKluis,
          reserveringskostenPerDag: sec.reserveringskostenPerDag,
          urlwebservice: sec.urlwebservice ?? "",
          Reservable: sec.Reservable,
          NotaVerwijssysteem: sec.NotaVerwijssysteem ?? "",
          Bezetting: 0,
          isactief: sec.isactief,
          qualificatie: sec.qualificatie ?? "NONE",
        },
      });
      sectieIdMap.set(sec.sectieId, sectieCreated.sectieId);

      const bikeTypeMap = new Map<number, number>();
      for (const sft of sec.secties_fietstype) {
        const sftCreated = await tx.sectie_fietstype.create({
          data: {
            sectieID: sectieCreated.sectieId,
            StallingsID: newStallingId,
            BikeTypeID: sft.BikeTypeID ?? 0,
            Capaciteit: sft.Capaciteit,
            Toegestaan: true,
          },
        });
        bikeTypeMap.set(sft.BikeTypeID ?? 0, sftCreated.SectionBiketypeID);
      }
      sectieBikeTypeMap.set(si, bikeTypeMap);
    }

    for (const kp of kostenperioden) {
      const newSectieId = kp.sectieId != null ? sectieIdMap.get(kp.sectieId) : null;
      if (newSectieId != null) {
        await tx.fietsenstalling_sectie_kostenperioden.create({
          data: {
            sectieId: newSectieId,
            index: kp.index,
            tijdsspanne: kp.tijdsspanne,
            kosten: kp.kosten,
          },
        });
      }
    }

    for (const plek of plekken) {
      const newSectieId = plek.sectie_id != null ? sectieIdMap.get(Number(plek.sectie_id)) : null;
      await tx.fietsenstalling_plek.create({
        data: {
          sectie_id: newSectieId != null ? BigInt(newSectieId) : null,
          titel: plek.titel,
          isActief: plek.isActief,
          isGeblokkeerd: plek.isGeblokkeerd,
          urlwebservice: plek.urlwebservice,
        },
      });
    }

    for (const tr of tariefregels) {
      const newSectieId = tr.sectieID != null ? sectieIdMap.get(tr.sectieID) : null;
      let newSectionBikeTypeID: number | null = null;
      if (tr.sectieID != null && tr.sectionBikeTypeID != null) {
        const sectieIndex = source.fietsenstalling_secties.findIndex((s) => s.sectieId === tr.sectieID);
        if (sectieIndex >= 0) {
          const sft = source.fietsenstalling_secties[sectieIndex]!.secties_fietstype.find(
            (s) => s.SectionBiketypeID === tr.sectionBikeTypeID
          );
          if (sft) {
            newSectionBikeTypeID = sectieBikeTypeMap.get(sectieIndex)?.get(sft.BikeTypeID ?? 0) ?? null;
          }
        }
      }
      const sectieIndex = tr.sectieID != null ? source.fietsenstalling_secties.findIndex((s) => s.sectieId === tr.sectieID) : -1;
      const truncatedSectieID = sectieIndex >= 0 ? `${newStallingsID}_${sectieIndex + 1}` : null;
      await tx.tariefregels.create({
        data: {
          index: tr.index,
          tijdsspanne: tr.tijdsspanne,
          kosten: tr.kosten,
          stallingsID: newStallingId,
          ...(newSectieId != null && { sectieID: newSectieId }),
          ...(newSectionBikeTypeID != null && { sectionBikeTypeID: newSectionBikeTypeID }),
          truncatedStallingsID: newStallingsID,
          ...(truncatedSectieID != null && { truncatedSectieID }),
        },
      });
    }

    for (const svc of source.fietsenstallingen_services) {
      await tx.fietsenstallingen_services.create({
        data: {
          FietsenstallingID: newStallingId,
          ServiceID: svc.ServiceID,
        },
      });
    }

    for (const av of source.abonnementsvorm_fietsenstalling) {
      await tx.abonnementsvorm_fietsenstalling.create({
        data: {
          SubscriptiontypeID: av.SubscriptiontypeID,
          BikeparkID: newStallingId,
        },
      });
    }

    for (const uitz of source.uitzonderingenopeningstijden) {
      await tx.uitzonderingenopeningstijden.create({
        data: {
          openingDateTime: uitz.openingDateTime,
          closingDateTime: uitz.closingDateTime,
          fietsenstallingsID: newStallingId,
        },
      });
    }

    for (const wk of winkansen) {
      await tx.fietsenstallingen_winkansen.create({
        data: {
          FietsenstallingID: newStallingId,
          DagNr: wk.DagNr,
          Winkans: wk.Winkans,
        },
      });
    }
  });

  return res.status(200).json({
    ok: true,
    locationid: newStallingsID,
    title: title.trim(),
  });
}
