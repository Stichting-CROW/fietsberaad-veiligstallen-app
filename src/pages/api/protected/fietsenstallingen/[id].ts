import type { NextApiRequest, NextApiResponse } from "next";
import { prisma } from "~/server/db";
import { getServerSession } from "next-auth";
import { authOptions } from '~/pages/api/auth/[...nextauth]'
import { z } from "zod";
import { generateID, validateUserSession } from "~/utils/server/database-tools";
import { fietsenstallingSchema, getDefaultNewFietsenstalling } from "~/types/fietsenstallingen";
import { fietsenstallingCreateSchema } from "~/types/fietsenstallingen";
import { type ParkingDetailsType, selectParkingDetailsType } from "~/types/parking";
import { userHasRight } from "~/types/utils";
import { VSSecurityTopic } from "~/types/securityprofile";
// TODO: convert these types to the types in the types/parking.tsx file
import type { fietsenstalling_sectie, sectie_fietstype } from "~/generated/prisma-client";

export type FietsenstallingResponse = {
  data?: ParkingDetailsType;
  error?: string;
};

const getNewStallingsID = async (siteID: string): Promise<string | false> => {
  try {
    if (!siteID) {
      console.error("getNewStallingsID - No SiteID provided");
      return false;
    }

    const theSite = await prisma.contacts.findFirst({
      select: {
        ZipID: true,
        ID: true
      },
      where: {
        ID: siteID
      }
    });

    if (!theSite) {
      console.error(`getNewStallingsID - Site not found for SiteID: ${siteID}`);
      return false;
    }

    if (!theSite.ZipID) {
      console.error(`getNewStallingsID - ZipID not found for SiteID: ${siteID}`);
      return false;
    }

    // Get all stallingsIDs that match the pattern ZipID_index
    // Format: stallingsid = ZipID + "_" + index
    const zipID = theSite.ZipID;
    const prefix = zipID + "_";
    
    console.log(`getNewStallingsID - Looking for existing StallingsIDs with prefix: ${prefix}`);
    
    // Get all StallingsIDs - we'll filter in code to handle case sensitivity
    const allStallingsRecords = await prisma.fietsenstallingen.findMany({
      where: {
        StallingsID: {
          not: null
        }
      },
      select: {
        StallingsID: true
      }
    });

    // Extract index numbers from StallingsID values matching the exact pattern ZipID_index
    // Handle case sensitivity by doing exact prefix matching
    let highestIndex = 0;
    const matchingStallingsIDs: string[] = [];

    for (const record of allStallingsRecords) {
      if (!record.StallingsID) continue;
      
      // Case-sensitive exact prefix match: must start with ZipID_ (exact case)
      if (!record.StallingsID.startsWith(prefix)) {
        continue;
      }
      
      matchingStallingsIDs.push(record.StallingsID);
      
      // Extract the index part after ZipID_
      const indexPart = record.StallingsID.substring(prefix.length);
      
      // Parse as integer (will be NaN if not a valid number)
      const index = parseInt(indexPart, 10);
      
      // Only consider valid positive numbers
      if (!isNaN(index) && index > 0 && index > highestIndex) {
        highestIndex = index;
      }
    }

    console.log(`getNewStallingsID - Found ${matchingStallingsIDs.length} matching StallingsIDs for ZipID ${zipID}, highest index: ${highestIndex}`);

    // Return ZipID + "_" + (highestIndex + 1) with 3-digit zero padding
    const newIndex = highestIndex + 1;
    const newStallingsID = zipID + '_' + newIndex.toString().padStart(3, '0');
    
    console.log(`getNewStallingsID - Generated new StallingsID: ${newStallingsID}`);
    
    return newStallingsID;
  } catch (e) {
    console.error("getNewStallingsID - Error:", e);
    return false;
  }
}

export const createNewStalling = async (req: NextApiRequest, res: NextApiResponse, isAanmelding: boolean) => {
  try {
    const newID = generateID();
    const data = { ...req.body, ID: newID };

    // Always generate new StallingsID based on SiteID when SiteID is provided
    // This ensures the pattern ZipID_index is always used, even if a template value was provided
    if(data.SiteID) {
      const newStallingID = await getNewStallingsID(data.SiteID);
      if(!newStallingID) {
       console.error("Error creating new fietsenstalling - unable to create StallingID for SiteID:", data.SiteID);
       res.status(500).json({error: "Error creating new fietsenstalling - unable to create StallingID"});
       return;
      }
      data.StallingsID = newStallingID;
      console.log(`createNewStalling - Generated StallingsID: ${newStallingID} for SiteID: ${data.SiteID}`);
    } else if(data.StallingsID === null || data.StallingsID === undefined) {
      // If no SiteID provided, we still need a StallingsID, but can't generate it properly
      console.error("Error creating new fietsenstalling - SiteID is required to generate StallingsID");
      res.status(400).json({error: "SiteID is required to generate StallingsID"});
      return;
   }

    const parseResult = fietsenstallingCreateSchema.safeParse(data);
    if (!parseResult.success) {
      console.error("Unexpected/missing data error:", JSON.stringify(parseResult.error.errors,null,2));
      res.status(400).json({ error: parseResult.error.errors });
      return;
    }

    const parsed = parseResult.data;

    if (!parsed.SiteID) {
      console.error("No SiteID provided");
      res.status(400).json({ error: "SiteID is required" });
      return;
    }

    const newData = {
      ID: newID,
      // Required fields
      StallingsID: parsed.StallingsID,
      Title: parsed.Title,
      Status: isAanmelding ? "aanm" : parsed.Status ?? "1", 
        
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
      Open_ma: parsed.Open_ma !== undefined ? (parsed.Open_ma === null ? null : new Date(parsed.Open_ma)) : undefined,
      Dicht_ma: parsed.Dicht_ma !== undefined ? (parsed.Dicht_ma === null ? null : new Date(parsed.Dicht_ma)) : undefined,
      Open_di: parsed.Open_di !== undefined ? (parsed.Open_di === null ? null : new Date(parsed.Open_di)) : undefined,
      Dicht_di: parsed.Dicht_di !== undefined ? (parsed.Dicht_di === null ? null : new Date(parsed.Dicht_di)) : undefined,
      Open_wo: parsed.Open_wo !== undefined ? (parsed.Open_wo === null ? null : new Date(parsed.Open_wo)) : undefined,
      Dicht_wo: parsed.Dicht_wo !== undefined ? (parsed.Dicht_wo === null ? null : new Date(parsed.Dicht_wo)) : undefined,
      Open_do: parsed.Open_do !== undefined ? (parsed.Open_do === null ? null : new Date(parsed.Open_do)) : undefined,
      Dicht_do: parsed.Dicht_do !== undefined ? (parsed.Dicht_do === null ? null : new Date(parsed.Dicht_do)) : undefined,
      Open_vr: parsed.Open_vr !== undefined ? (parsed.Open_vr === null ? null : new Date(parsed.Open_vr)) : undefined,
      Dicht_vr: parsed.Dicht_vr !== undefined ? (parsed.Dicht_vr === null ? null : new Date(parsed.Dicht_vr)) : undefined,
      Open_za: parsed.Open_za !== undefined ? (parsed.Open_za === null ? null : new Date(parsed.Open_za)) : undefined,
      Dicht_za: parsed.Dicht_za !== undefined ? (parsed.Dicht_za === null ? null : new Date(parsed.Dicht_za)) : undefined,
      Open_zo: parsed.Open_zo !== undefined ? (parsed.Open_zo === null ? null : new Date(parsed.Open_zo)) : undefined,
      Dicht_zo: parsed.Dicht_zo !== undefined ? (parsed.Dicht_zo === null ? null : new Date(parsed.Dicht_zo)) : undefined,
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
      ExploitantID: parsed.ExploitantID !== undefined ? (parsed.ExploitantID === null ? null : parsed.ExploitantID) : undefined,
      hasUniSectionPrices: parsed.hasUniSectionPrices ?? true,
      hasUniBikeTypePrices: parsed.hasUniBikeTypePrices ?? false,
      shadowBikeparkID: parsed.shadowBikeparkID ?? undefined,
      BronBezettingsdata: parsed.BronBezettingsdata ?? "FMS",
      reservationCostPerDay: parsed.reservationCostPerDay ?? undefined,
      // wachtlijst_Id: parsed.wachtlijst_Id ?? undefined,
      thirdPartyReservationsUrl: parsed.thirdPartyReservationsUrl ?? undefined,
      HelpdeskHandmatigIngesteld: parsed.HelpdeskHandmatigIngesteld ?? false,
    }

    const newFietsenstalling = await prisma.fietsenstallingen.create({data: newData, select: selectParkingDetailsType}) as unknown as ParkingDetailsType;
    if(!newFietsenstalling) {
      console.error("Error creating new fietsenstalling:", newData);
      res.status(500).json({error: "Error creating new fietsenstalling"});
      return;
    }

    const newSectieIdResult = await prisma.fietsenstalling_sectie.aggregate({
      _max: {
        sectieId: true
      }
    });
    const sectieId = newSectieIdResult._max.sectieId !== null ? newSectieIdResult._max.sectieId + 1 : 1;
    
    // Generate externalId: StallingsID_001 for first section
    const externalId = newFietsenstalling.StallingsID ? `${newFietsenstalling.StallingsID}_001` : null;
    
    // Set isKluis based on fietsenstalling type
    // isKluis = 1 for fietskluizen type, 0 for other types
    const isKluis = (newFietsenstalling.Type === "fietskluizen");
    
    const sectiedata: fietsenstalling_sectie = {
      fietsenstallingsId: newFietsenstalling.ID,
      sectieId,
      titel: 'sectie 1',
      isactief: true,
      externalId: externalId,
      omschrijving: "",
      capaciteit: 0,
      CapaciteitBromfiets: null,
      kleur: "00FF00",
      isKluis: isKluis,
      reserveringskostenPerDag: null,
      urlwebservice: null,
      Reservable: false,
      NotaVerwijssysteem: null,
      Bezetting: 0,
      qualificatie: "NONE"
    }

    await prisma.fietsenstalling_sectie.create({ data: sectiedata });
    const allTypes = await prisma.fietstypen.findMany();
    for (const typedata of allTypes) {
      const newSubSectieIdResult = await prisma.sectie_fietstype.aggregate({
        _max: {
          SectionBiketypeID: true
        }
      });
      const subSectieId = newSubSectieIdResult._max.SectionBiketypeID !== null ? newSubSectieIdResult._max.SectionBiketypeID + 1 : 1;
      const subsectiedata: sectie_fietstype = {
        SectionBiketypeID: subSectieId,
        Capaciteit: 0,
        Toegestaan: true,
        sectieID: sectieId,
        StallingsID: newFietsenstalling.ID,
        BikeTypeID: typedata.ID
      }
      await prisma.sectie_fietstype.create({ data: subsectiedata });
    }

    res.status(201).json({ 
      data: [newFietsenstalling]
    });
  } catch (e) {
    console.error("Error creating new fietsenstalling:", e);
    res.status(500).json({ error: "Internal server error" });
  }
}

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  const session = await getServerSession(req, res, authOptions);
  const id = req.query.id as string;
  
  // For GET requests with non-new IDs, allow access without authentication
  if (req.method === "GET" && id !== "new") {
    const fietsenstalling = await prisma.fietsenstallingen.findFirst({
      where: { ID: id },
      select: selectParkingDetailsType
    });
    res.status(200).json({data: fietsenstalling});
    return;
  }
  
  // For all other operations, require authentication
  if (!session?.user) {
    console.error("Unauthorized - no session found");
    res.status(401).json({error: "Unauthorized - no session found"}); // Unauthorized
    return;
  }

  // Check user rights
  const hasFietsenstallingenAdmin = userHasRight(session?.user?.securityProfile, VSSecurityTopic.instellingen_fietsenstallingen_admin);
  const hasFietsenstallingenBeperkt = userHasRight(session?.user?.securityProfile, VSSecurityTopic.instellingen_fietsenstallingen_beperkt);
  
  // For POST and DELETE, require admin rights
  if ((req.method === "POST" || req.method === "DELETE") && !hasFietsenstallingenAdmin) {
    res.status(403).json({ error: "Access denied - admin rights required for this operation" });
    return;
  }
  
  // For PUT, require either admin or beperkt rights
  if (req.method === "PUT" && !hasFietsenstallingenAdmin && !hasFietsenstallingenBeperkt) {
    res.status(403).json({ error: "Access denied - insufficient permissions" });
    return;
  }

  const validateUserSessionResult = await validateUserSession(session, "any");
  if ('error' in validateUserSessionResult) {
    console.error("Unauthorized - invalid session", validateUserSessionResult.error);
    res.status(401).json({error: validateUserSessionResult.error}); // Unauthorized
    return;
  }

  const { sites, activeContactId } = validateUserSessionResult;

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
        if(!activeContactId || activeContactId === "1") {
          console.error("Unauthorized - no active contact ID");
          res.status(403).json({ error: "No active contact ID" });
          return;
        }

        const currentContactInfo = await prisma.contacts.findFirst({
          where: {
            ID: activeContactId
          },
          select: {
            Coordinaten: true
          }
        });

        if(!currentContactInfo || !currentContactInfo.Coordinaten) {
          console.error("Unauthorized - no coordinaten for active contact ID", activeContactId);
          res.status(403).json({ error: "No coordinaten for active contact ID" });
          return;
        }

        // add timestamp to the name
        const defaultRecord = getDefaultNewFietsenstalling('Test Fietsenstalling ' + new Date().toISOString());
        defaultRecord.Coordinaten = currentContactInfo.Coordinaten;

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
        return createNewStalling(req, res, false);
      } catch (e) {
        console.error("Error creating fietsenstalling:", e);
        res.status(500).json({error: "Error creating fietsenstalling"});
      }
    
      break;
    }
    case "PUT": {
      console.log("PUT request received for fietsenstalling:", id);
      try {
        const parseResult = fietsenstallingSchema.partial().safeParse(req.body);
        if (!parseResult.success) {
          console.error("Unexpected/missing data error:", parseResult.error);
          res.status(400).json({error: "Unexpected/missing data error:"});
          return;
        }

        const parsed = parseResult.data;
        
        // Validate Image field length if provided
        if (parsed.Image !== undefined && parsed.Image !== null) {
          if (parsed.Image.length > 255) {
            console.error("Image field exceeds maximum length of 255 characters:", parsed.Image.length);
            res.status(400).json({error: "Image field exceeds maximum length of 255 characters"});
            return;
          }
        }
        
        // If user has beperkt rights, filter out restricted fields
        let updateData: any = {};
        
        if (hasFietsenstallingenAdmin) {
          // Admin can update all fields
          updateData = {
            StallingsID: parsed.StallingsID ?? undefined,
            SiteID: parsed.SiteID ?? undefined,
            Title: parsed.Title ?? undefined,
            StallingsIDExtern: parsed.StallingsIDExtern ?? undefined,
            Description: parsed.Description ?? undefined,
            Image: parsed.Image !== undefined ? (parsed.Image === null ? null : parsed.Image) : undefined,
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
            Open_ma: parsed.Open_ma !== undefined ? (parsed.Open_ma === null ? null : new Date(parsed.Open_ma)) : undefined,
            Dicht_ma: parsed.Dicht_ma !== undefined ? (parsed.Dicht_ma === null ? null : new Date(parsed.Dicht_ma)) : undefined,
            Open_di: parsed.Open_di !== undefined ? (parsed.Open_di === null ? null : new Date(parsed.Open_di)) : undefined,
            Dicht_di: parsed.Dicht_di !== undefined ? (parsed.Dicht_di === null ? null : new Date(parsed.Dicht_di)) : undefined,
            Open_wo: parsed.Open_wo !== undefined ? (parsed.Open_wo === null ? null : new Date(parsed.Open_wo)) : undefined,
            Dicht_wo: parsed.Dicht_wo !== undefined ? (parsed.Dicht_wo === null ? null : new Date(parsed.Dicht_wo)) : undefined,
            Open_do: parsed.Open_do !== undefined ? (parsed.Open_do === null ? null : new Date(parsed.Open_do)) : undefined,
            Dicht_do: parsed.Dicht_do !== undefined ? (parsed.Dicht_do === null ? null : new Date(parsed.Dicht_do)) : undefined,
            Open_vr: parsed.Open_vr !== undefined ? (parsed.Open_vr === null ? null : new Date(parsed.Open_vr)) : undefined,
            Dicht_vr: parsed.Dicht_vr !== undefined ? (parsed.Dicht_vr === null ? null : new Date(parsed.Dicht_vr)) : undefined,
            Open_za: parsed.Open_za !== undefined ? (parsed.Open_za === null ? null : new Date(parsed.Open_za)) : undefined,
            Dicht_za: parsed.Dicht_za !== undefined ? (parsed.Dicht_za === null ? null : new Date(parsed.Dicht_za)) : undefined,
            Open_zo: parsed.Open_zo !== undefined ? (parsed.Open_zo === null ? null : new Date(parsed.Open_zo)) : undefined,
            Dicht_zo: parsed.Dicht_zo !== undefined ? (parsed.Dicht_zo === null ? null : new Date(parsed.Dicht_zo)) : undefined,
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
            ExploitantID: parsed.ExploitantID !== undefined ? (parsed.ExploitantID === null ? null : parsed.ExploitantID) : undefined,
            hasUniSectionPrices: parsed.hasUniSectionPrices ?? undefined,
            hasUniBikeTypePrices: parsed.hasUniBikeTypePrices ?? undefined,
            shadowBikeparkID: parsed.shadowBikeparkID ?? undefined,
            BronBezettingsdata: parsed.BronBezettingsdata ?? undefined,
            reservationCostPerDay: parsed.reservationCostPerDay ?? undefined,
            // wachtlijst_Id: parsed.wachtlijst_Id ?? undefined,
            thirdPartyReservationsUrl: parsed.thirdPartyReservationsUrl ?? undefined,
            HelpdeskHandmatigIngesteld: parsed.HelpdeskHandmatigIngesteld ?? undefined,
          };
        } else {
          // Beperkt users can only update specific fields
          updateData = {
            Title: parsed.Title ?? undefined,
            Image: parsed.Image !== undefined ? (parsed.Image === null ? null : parsed.Image) : undefined,
            Description: parsed.Description ?? undefined,
            Location: parsed.Location ?? undefined,
            Postcode: parsed.Postcode ?? undefined,
            Plaats: parsed.Plaats ?? undefined,
            IsStationsstalling: parsed.IsStationsstalling ?? undefined,
            MaxStallingsduur: parsed.MaxStallingsduur ?? undefined,
            ExtraServices: parsed.ExtraServices ?? undefined,
            Openingstijden: parsed.Openingstijden ?? undefined,
            Open_ma: parsed.Open_ma !== undefined ? (parsed.Open_ma === null ? null : new Date(parsed.Open_ma)) : undefined,
            Dicht_ma: parsed.Dicht_ma !== undefined ? (parsed.Dicht_ma === null ? null : new Date(parsed.Dicht_ma)) : undefined,
            Open_di: parsed.Open_di !== undefined ? (parsed.Open_di === null ? null : new Date(parsed.Open_di)) : undefined,
            Dicht_di: parsed.Dicht_di !== undefined ? (parsed.Dicht_di === null ? null : new Date(parsed.Dicht_di)) : undefined,
            Open_wo: parsed.Open_wo !== undefined ? (parsed.Open_wo === null ? null : new Date(parsed.Open_wo)) : undefined,
            Dicht_wo: parsed.Dicht_wo !== undefined ? (parsed.Dicht_wo === null ? null : new Date(parsed.Dicht_wo)) : undefined,
            Open_do: parsed.Open_do !== undefined ? (parsed.Open_do === null ? null : new Date(parsed.Open_do)) : undefined,
            Dicht_do: parsed.Dicht_do !== undefined ? (parsed.Dicht_do === null ? null : new Date(parsed.Dicht_do)) : undefined,
            Open_vr: parsed.Open_vr !== undefined ? (parsed.Open_vr === null ? null : new Date(parsed.Open_vr)) : undefined,
            Dicht_vr: parsed.Dicht_vr !== undefined ? (parsed.Dicht_vr === null ? null : new Date(parsed.Dicht_vr)) : undefined,
            Open_za: parsed.Open_za !== undefined ? (parsed.Open_za === null ? null : new Date(parsed.Open_za)) : undefined,
            Dicht_za: parsed.Dicht_za !== undefined ? (parsed.Dicht_za === null ? null : new Date(parsed.Dicht_za)) : undefined,
            Open_zo: parsed.Open_zo !== undefined ? (parsed.Open_zo === null ? null : new Date(parsed.Open_zo)) : undefined,
            Dicht_zo: parsed.Dicht_zo !== undefined ? (parsed.Dicht_zo === null ? null : new Date(parsed.Dicht_zo)) : undefined,
            EditorModified: parsed.EditorModified ?? undefined,
            DateModified: parsed.DateModified ? new Date(parsed.DateModified) : undefined,
          };
        }

        // Check if Type is being changed - if so, update all sections' isKluis flag
        if (parsed.Type !== undefined) {
          // Get current type to compare
          const currentFietsenstalling = await prisma.fietsenstallingen.findFirst({
            where: { ID: id },
            select: { Type: true }
          });
          
          // Normalize type values for comparison (case-insensitive)
          const currentType = currentFietsenstalling?.Type?.toLowerCase() || null;
          const newType = parsed.Type?.toLowerCase() || null;
          
          // Check if type is actually changing
          if (currentType !== newType) {
            // Set isKluis based on new type: true for fietskluizen, false for others
            const newIsKluis = newType === "fietskluizen";
            
            console.log(`Type change detected: "${currentFietsenstalling?.Type}" -> "${parsed.Type}". Setting isKluis to ${newIsKluis} for all sections`);
            
            // Get section count before update
            const sectionCount = await prisma.fietsenstalling_sectie.count({
              where: { fietsenstallingsId: id }
            });
            
            if (sectionCount > 0) {
              // Update all sections for this fietsenstalling
              const updateResult = await prisma.fietsenstalling_sectie.updateMany({
                where: { fietsenstallingsId: id },
                data: { isKluis: newIsKluis }
              });
              
              console.log(`Updated ${updateResult.count} section(s) out of ${sectionCount} total. isKluis set to ${newIsKluis}`);
              
              // Verify the update worked
              const verifySections = await prisma.fietsenstalling_sectie.findMany({
                where: { fietsenstallingsId: id },
                select: { sectieId: true, isKluis: true }
              });
              
              console.log(`Verification - Sections isKluis values:`, verifySections.map(s => ({ sectieId: s.sectieId, isKluis: s.isKluis })));
            } else {
              console.log(`No sections found to update for fietsenstalling ${id}`);
            }
          } else {
            console.log(`Type not changed: "${currentFietsenstalling?.Type}" (no update needed)`);
          }
        }
        
        const updatedFietsenstalling = await prisma.fietsenstallingen.update({
          select: selectParkingDetailsType,
          where: { ID: id },
          data: updateData
        });
        res.status(200).json({data: updatedFietsenstalling});
      } catch (e) {
        if (e instanceof z.ZodError) {
          console.error("Unexpected/missing data error:", e.errors);
          res.status(400).json({error: "Unexpected/missing data error:"});
        } else {
          console.error("Error updating fietsenstalling:", e);
          console.error("Error details:", {
            message: e instanceof Error ? e.message : String(e),
            stack: e instanceof Error ? e.stack : undefined,
            body: req.body,
            id: id
          });
          res.status(500).json({error: "Internal server error"});
        }
      }
      break;
    }
    case "DELETE": {
      try {
        // First, get all sections for this fietsenstalling
        const sections = await prisma.fietsenstalling_sectie.findMany({
          where: { fietsenstallingsId: id },
          select: { sectieId: true }
        });

        // Delete all sectie_fietstype records for each section
        for (const section of sections) {
          await prisma.sectie_fietstype.deleteMany({
            where: { sectieID: section.sectieId }
          });
        }

        // Delete all sections
        await prisma.fietsenstalling_sectie.deleteMany({
          where: { fietsenstallingsId: id }
        });

        // Finally, delete the fietsenstalling
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