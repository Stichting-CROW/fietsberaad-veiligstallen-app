import { prisma } from "~/server/db";
import type { fietsenstallingen, fietsenstalling_sectie, sectie_fietstype } from "~/generated/prisma-client";
import type { ICrudService } from "~/backend/handlers/crud-service-interface";

// 
const include = {
  fietsenstalling_type: {
    select: {
      id: true,
      name: true,
      sequence: true,
    }
  },
  fietsenstalling_secties: {
    include: {
      secties_fietstype: {
        include: {
          fietstype: true
        }
      }
    }
  },
  fietsenstallingen_services: {
    include: {
      services: true
    }
  },
  abonnementsvorm_fietsenstalling: {
    include: {
      abonnementsvormen: true
    }
  },
  uitzonderingenopeningstijden: true,
}

// inspired by https://medium.com/@brandonlostboy/build-it-better-next-js-crud-api-b45d2e923896
const FietsenstallingenService: ICrudService<fietsenstallingen> = {
  getAll: async () => {
    return await prisma.fietsenstallingen.findMany({
      where: {
        Title: {
          not: 'Systeemstalling'
        }
      },
      include: {
        fietsenstalling_type: {
          select: {
            id: true,
            name: true,
            sequence: true,
          }
        },
        fietsenstalling_secties: true,
        uitzonderingenopeningstijden: true,
      }
    });
  },
  getOne: async (id: string) => {
    const item = await prisma.fietsenstallingen.findFirst({
      where: { ID: id },
      include
    });

    return item;
  },
  create: async (_data: Partial<fietsenstallingen>): Promise<fietsenstallingen> => {
    try {
      console.log("### create", _data);
      const createresult = await prisma.fietsenstallingen.create({ data: _data });

      if (createresult) {
        const newSectieIdResult = await prisma.fietsenstalling_sectie.aggregate({
          _max: {
            sectieId: true
          }
        });
        const sectieId = newSectieIdResult._max.sectieId !== null ? newSectieIdResult._max.sectieId + 1 : 1;
        const sectiedata: fietsenstalling_sectie = {
          fietsenstallingsId: createresult.ID,
          sectieId,
          titel: 'sectie 1',
          isactief: true,
          externalId: null,
          omschrijving: null,
          capaciteit: null,
          CapaciteitBromfiets: null,
          kleur: "",
          isKluis: false,
          reserveringskostenPerDag: null,
          urlwebservice: null,
          Reservable: false,
          NotaVerwijssysteem: null,
          Bezetting: 0,
          qualificatie: null
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
            StallingsID: createresult.ID,
            BikeTypeID: typedata.ID
          }
          await prisma.sectie_fietstype.create({ data: subsectiedata });
        }
      }

      return createresult;
    } catch (error) {
      console.error("### create error", error);
      throw new Error("Create failed");
    }
  },
  update: async (
    _id: string,
    _data: fietsenstallingen
  ): Promise<fietsenstallingen> => {
    try {
      // Remove ID and SiteID from the data object as they need special handling
      const { ID, SiteID, ...updateData } = _data;
      
      // Check if Type is being changed - if so, update all sections' isKluis flag
      if (updateData.Type !== undefined) {
        // Get current type to compare
        const currentFietsenstalling = await prisma.fietsenstallingen.findFirst({
          where: { ID: _id },
          select: { Type: true }
        });
        
        // Normalize type values for comparison (case-insensitive)
        const currentType = currentFietsenstalling?.Type?.toLowerCase() || null;
        const newType = updateData.Type?.toLowerCase() || null;
        
        // Check if type is actually changing
        if (currentType !== newType) {
          // Set isKluis based on new type: true for fietskluizen, false for others
          const newIsKluis = newType === "fietskluizen";
          
          console.log(`[FietsenstallingenService] Type change detected: "${currentFietsenstalling?.Type}" -> "${updateData.Type}". Setting isKluis to ${newIsKluis} for all sections`);
          
          // Get section count before update
          const sectionCount = await prisma.fietsenstalling_sectie.count({
            where: { fietsenstallingsId: _id }
          });
          
          if (sectionCount > 0) {
            // Update all sections for this fietsenstalling
            const updateResult = await prisma.fietsenstalling_sectie.updateMany({
              where: { fietsenstallingsId: _id },
              data: { isKluis: newIsKluis }
            });
            
            console.log(`[FietsenstallingenService] Updated ${updateResult.count} section(s) out of ${sectionCount} total. isKluis set to ${newIsKluis}`);
            
            // Verify the update worked
            const verifySections = await prisma.fietsenstalling_sectie.findMany({
              where: { fietsenstallingsId: _id },
              select: { sectieId: true, isKluis: true }
            });
            
            console.log(`[FietsenstallingenService] Verification - Sections isKluis values:`, verifySections.map(s => ({ sectieId: s.sectieId, isKluis: s.isKluis })));
          } else {
            console.log(`[FietsenstallingenService] No sections found to update for fietsenstalling ${_id}`);
          }
        } else {
          console.log(`[FietsenstallingenService] Type not changed: "${currentFietsenstalling?.Type}" (no update needed)`);
        }
      }
      
      const result = await prisma.fietsenstallingen.update({
        where: { ID: _id },
        data: updateData
      });

      return result;
    } catch (error) {
      console.error("### update error", error);
      throw new Error("Update failed");
    }
  },
  delete: async (_id: string): Promise<fietsenstallingen> => {
    try {
      return await prisma.fietsenstallingen.delete({ where: { ID: _id } });
    } catch (error) {
      console.error("### delete error", error);
      throw new Error("Function not implemented.");
    }
  },
};

export default FietsenstallingenService;
