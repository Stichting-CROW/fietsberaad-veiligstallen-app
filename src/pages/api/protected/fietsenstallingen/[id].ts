import type { NextApiRequest, NextApiResponse } from "next";
import { Prisma } from "~/generated/prisma-client";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { z } from "zod";
import { generateID, validateUserSession } from "~/utils/server/database-tools";
import { fietsenstallingSchema, getDefaultNewFietsenstalling } from "~/types/fietsenstallingen";
import { fietsenstallingCreateSchema } from "~/types/fietsenstallingen";
import { type ParkingDetailsType, selectParkingDetailsType } from "~/types/parking";

export type FietsenstallingResponse = {
  data?: ParkingDetailsType;
  error?: string;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    console.error("Unauthorized - no session found");
    res.status(401).json({error: "Unauthorized - no session found"}); // Unauthorized
    return;
  }

  const validateUserSessionResult = await validateUserSession(session, "any");
  if ('error' in validateUserSessionResult) {
    console.error("Unauthorized - invalid session", validateUserSessionResult.error);
    res.status(401).json({error: validateUserSessionResult.error}); // Unauthorized
    return;
  }

  const { sites, userId } = validateUserSessionResult;

  const id = req.query.id as string;
  // user has access to this stalling if the SiteID for this site is 
  // in the sites array 
  if(id!=='new') {
    const tmpstalling = await prisma.fietsenstallingen.findFirst({
      where: {
        ID: id
      }
    });

    if(!tmpstalling || !tmpstalling.SiteID || !sites.includes(tmpstalling.SiteID)) {
      console.error("Unauthorized - no access to this organization", id);
      res.status(403).json({ error: "No access to this organization" });
      return;
    }
  }

  switch (req.method) {
    case "GET": {
      if (id === "new") {
        // add timestamp to the name
        const defaultRecord = getDefaultNewFietsenstalling('Test Fietsenstalling ' + new Date().toISOString());
        res.status(200).json({data: defaultRecord});
        return;
      }

      const fietsenstalling = await prisma.fietsenstallingen.findFirst({
        where: { ID: id },
        select: selectParkingDetailsType
      });

      res.status(200).json({data: fietsenstalling});
      break;
    }
    case "POST": {
      try {
        const newID = generateID();
        const data = { ...req.body, ID: newID };

        const parseResult = fietsenstallingCreateSchema.safeParse(data);
        if (!parseResult.success) {
          console.error("Unexpected/missing data error:", JSON.stringify(parseResult.error.errors,null,2));
          res.status(400).json({ error: parseResult.error.errors });
          return;
        }
        const parsed = parseResult.data;

        const newData = {
          ID: newID,
          // Required fields
          StallingsID: parsed.StallingsID,
          Title: parsed.Title,
          Status: "1", // Default status
            
          // Optional fields with defaults
          SiteID: parsed.SiteID ?? undefined,
          StallingsIDExtern: parsed.StallingsIDExtern ?? undefined,
          Description: parsed.Description ?? undefined,
          Image: parsed.Image ?? undefined,
          Location: parsed.Location ?? undefined,
          Postcode: parsed.Postcode ?? undefined,
          Plaats: parsed.Plaats ?? undefined,
          Capacity: parsed.Capacity ?? undefined,
          Openingstijden: parsed.Openingstijden ?? undefined,
          EditorCreated: parsed.EditorCreated ?? undefined,
          DateCreated: parsed.DateCreated ?? new Date(),
          EditorModified: parsed.EditorModified ?? undefined,
          DateModified: parsed.DateModified ?? new Date(),
          Ip: parsed.Ip ?? undefined,
          Coordinaten: parsed.Coordinaten ?? undefined,
          Type: parsed.Type ?? undefined,
          Verwijssysteem: parsed.Verwijssysteem ?? false,
          VerwijssysteemOverzichten: parsed.VerwijssysteemOverzichten ?? false,
          FMS: parsed.FMS ?? false,
          Open_ma: parsed.Open_ma ?? undefined,
          Dicht_ma: parsed.Dicht_ma ?? undefined,
          Open_di: parsed.Open_di ?? undefined,
          Dicht_di: parsed.Dicht_di ?? undefined,
          Open_wo: parsed.Open_wo ?? undefined,
          Dicht_wo: parsed.Dicht_wo ?? undefined,
          Open_do: parsed.Open_do ?? undefined,
          Dicht_do: parsed.Dicht_do ?? undefined,
          Open_vr: parsed.Open_vr ?? undefined,
          Dicht_vr: parsed.Dicht_vr ?? undefined,
          Open_za: parsed.Open_za ?? undefined,
          Dicht_za: parsed.Dicht_za ?? undefined,
          Open_zo: parsed.Open_zo ?? undefined,
          Dicht_zo: parsed.Dicht_zo ?? undefined,
          OmschrijvingTarieven: parsed.OmschrijvingTarieven ?? undefined,
          IsStationsstalling: parsed.IsStationsstalling ?? false,
          IsPopup: parsed.IsPopup ?? false,
          NotaVerwijssysteem: parsed.NotaVerwijssysteem ?? undefined,
          Tariefcode: parsed.Tariefcode ?? undefined,
          Toegangscontrole: parsed.Toegangscontrole ?? undefined,
          Beheerder: parsed.Beheerder ?? undefined,
          BeheerderContact: parsed.BeheerderContact ?? undefined,
          Url: parsed.Url ?? undefined,
          ExtraServices: parsed.ExtraServices ?? undefined,
          dia: parsed.dia ?? undefined,
          BerekentStallingskosten: parsed.BerekentStallingskosten ?? false,
          AantalReserveerbareKluizen: parsed.AantalReserveerbareKluizen ?? 0,
          MaxStallingsduur: parsed.MaxStallingsduur ?? 0,
          HeeftExterneBezettingsdata: parsed.HeeftExterneBezettingsdata ?? false,
          ExploitantID: parsed.ExploitantID ?? undefined,
          hasUniSectionPrices: parsed.hasUniSectionPrices ?? true,
          hasUniBikeTypePrices: parsed.hasUniBikeTypePrices ?? false,
          shadowBikeparkID: parsed.shadowBikeparkID ?? undefined,
          BronBezettingsdata: parsed.BronBezettingsdata ?? "FMS",
          reservationCostPerDay: parsed.reservationCostPerDay ?? undefined,
          wachtlijst_Id: parsed.wachtlijst_Id ?? undefined,
          thirdPartyReservationsUrl: parsed.thirdPartyReservationsUrl ?? undefined,
        }

        const newFietsenstalling = await prisma.fietsenstallingen.create({data: newData, select: selectParkingDetailsType}) as unknown as ParkingDetailsType;
        if(!newFietsenstalling) {
          console.error("Error creating new fietsenstalling:", newData);
          res.status(500).json({error: "Error creating new fietsenstalling"});
          return;
        }

        res.status(201).json({ 
          data: [newFietsenstalling]
        });
      } catch (e) {
        console.error("Error creating fietsenstalling:", e);
        res.status(500).json({error: "Error creating fietsenstalling"});
      }
      break;
    }
    case "PUT": {
      try {
        const parseResult = fietsenstallingSchema.partial().safeParse(req.body);
        if (!parseResult.success) {
          console.error("Unexpected/missing data error:", parseResult.error);
          res.status(400).json({error: "Unexpected/missing data error:"});
          return;
        }

        const parsed = parseResult.data;
        const updatedFietsenstalling = await prisma.fietsenstallingen.update({
          select: selectParkingDetailsType,
          where: { ID: id },
          data: {
            StallingsID: parsed.StallingsID ?? undefined,
            SiteID: parsed.SiteID ?? undefined,
            Title: parsed.Title ?? undefined,
            StallingsIDExtern: parsed.StallingsIDExtern ?? undefined,
            Description: parsed.Description ?? undefined,
            Image: parsed.Image ?? undefined,
            Location: parsed.Location ?? undefined,
            Postcode: parsed.Postcode ?? undefined,
            Plaats: parsed.Plaats ?? undefined,
            Capacity: parsed.Capacity ?? undefined,
            Openingstijden: parsed.Openingstijden ?? undefined,
            Status: parsed.Status ?? undefined,
            EditorModified: parsed.EditorModified ?? undefined,
            DateModified: parsed.DateModified ? new Date(parsed.DateModified) : undefined,
            Ip: parsed.Ip ?? undefined,
            Coordinaten: parsed.Coordinaten ?? undefined,
            Type: parsed.Type ?? undefined,
            Verwijssysteem: parsed.Verwijssysteem ?? undefined,
            VerwijssysteemOverzichten: parsed.VerwijssysteemOverzichten ?? undefined,
            FMS: parsed.FMS ?? undefined,
            Open_ma: parsed.Open_ma ? new Date(parsed.Open_ma) : undefined,
            Dicht_ma: parsed.Dicht_ma ? new Date(parsed.Dicht_ma) : undefined,
            Open_di: parsed.Open_di ? new Date(parsed.Open_di) : undefined,
            Dicht_di: parsed.Dicht_di ? new Date(parsed.Dicht_di) : undefined,
            Open_wo: parsed.Open_wo ? new Date(parsed.Open_wo) : undefined,
            Dicht_wo: parsed.Dicht_wo ? new Date(parsed.Dicht_wo) : undefined,
            Open_do: parsed.Open_do ? new Date(parsed.Open_do) : undefined,
            Dicht_do: parsed.Dicht_do ? new Date(parsed.Dicht_do) : undefined,
            Open_vr: parsed.Open_vr ? new Date(parsed.Open_vr) : undefined,
            Dicht_vr: parsed.Dicht_vr ? new Date(parsed.Dicht_vr) : undefined,
            Open_za: parsed.Open_za ? new Date(parsed.Open_za) : undefined,
            Dicht_za: parsed.Dicht_za ? new Date(parsed.Dicht_za) : undefined,
            Open_zo: parsed.Open_zo ? new Date(parsed.Open_zo) : undefined,
            Dicht_zo: parsed.Dicht_zo ? new Date(parsed.Dicht_zo) : undefined,
            OmschrijvingTarieven: parsed.OmschrijvingTarieven ?? undefined,
            IsStationsstalling: parsed.IsStationsstalling ?? undefined,
            IsPopup: parsed.IsPopup ?? undefined,
            NotaVerwijssysteem: parsed.NotaVerwijssysteem ?? undefined,
            Tariefcode: parsed.Tariefcode ?? undefined,
            Toegangscontrole: parsed.Toegangscontrole ?? undefined,
            Beheerder: parsed.Beheerder ?? undefined,
            BeheerderContact: parsed.BeheerderContact ?? undefined,
            Url: parsed.Url ?? undefined,
            ExtraServices: parsed.ExtraServices ?? undefined,
            dia: parsed.dia ?? undefined,
            BerekentStallingskosten: parsed.BerekentStallingskosten ?? undefined,
            AantalReserveerbareKluizen: parsed.AantalReserveerbareKluizen ?? undefined,
            MaxStallingsduur: parsed.MaxStallingsduur ?? undefined,
            HeeftExterneBezettingsdata: parsed.HeeftExterneBezettingsdata ?? undefined,
            ExploitantID: parsed.ExploitantID ?? undefined,
            hasUniSectionPrices: parsed.hasUniSectionPrices ?? undefined,
            hasUniBikeTypePrices: parsed.hasUniBikeTypePrices ?? undefined,
            shadowBikeparkID: parsed.shadowBikeparkID ?? undefined,
            BronBezettingsdata: parsed.BronBezettingsdata ?? undefined,
            reservationCostPerDay: parsed.reservationCostPerDay ?? undefined,
            wachtlijst_Id: parsed.wachtlijst_Id ?? undefined,
            thirdPartyReservationsUrl: parsed.thirdPartyReservationsUrl ?? undefined,
          }
        });
        res.status(200).json({data: updatedFietsenstalling});
      } catch (e) {
        if (e instanceof z.ZodError) {
          console.error("Unexpected/missing data error:", e.errors);
          res.status(400).json({error: "Unexpected/missing data error:"});
        } else {
          res.status(500).json({error: "Error updating fietsenstalling"});
        }
      }
      break;
    }
    case "DELETE": {
      try {
        await prisma.fietsenstallingen.delete({
          where: { ID: id }
        });
        res.status(200).json({});
      } catch (e) {
        console.error("Error deleting fietsenstalling:", e);
        res.status(500).json({error: "Error deleting fietsenstalling"});
      }
      break;
    }
    default: {
      res.status(405).json({error: "Method Not Allowed"}); // Method Not Allowed
    }
  }
}