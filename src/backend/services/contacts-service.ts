import Prisma from "~/generated/prisma-client"
import { prisma } from "~/server/db";
import type { contacts } from "~/generated/prisma-client";
import type { ICrudService } from "~/backend/handlers/crud-service-interface";

// export default async function handle(req: NextApiRequest, res: NextApiResponse) {
//   if (req.query.cbsCode && Array.isArray(req.query.cbsCode) ||
//     req.query.urlName && Array.isArray(req.query.urlName) ||
//     req.query.itemType && Array.isArray(req.query.itemType)) {
//     res.status(400).json({});
//     return;
//   }

//   let where: Prisma.contactsWhereInput = {
//     Status: '1'
//   }
//   if (req.query.cbsCode) where.Gemeentecode = Number(req.query.cbsCode);
//   if (req.query.urlName) where.UrlName = req.query.urlName;
//   if (req.query.itemType) where.ItemType = req.query.itemType;

//   const queryRequest = {
//     where: where,
//     select: {
//       ID: true,
//       CompanyName: true,
//       ThemeColor1: true,
//       ThemeColor2: true,
//       UrlName: true,
//       CompanyLogo: true,
//       CompanyLogo2: true,
//       Coordinaten: true
//     }
//   }

//   const result = await prisma.contacts.findMany(queryRequest);
//   res.json(result);
// }
// BigInt.prototype.toJSON = function () {
//   const int = Number.parseInt(this.toString());
//   return int ?? this.toString();
// };

const include = {
      // ID: true,
      // CompanyName: true,
      // ThemeColor1: true,
      // ThemeColor2: true,
      // UrlName: true,
      // CompanyLogo: true,
      // CompanyLogo2: true,
      // Coordinaten: true
}

// inspired by https://medium.com/@brandonlostboy/build-it-better-next-js-crud-api-b45d2e923896
const ContactsService: ICrudService<Partial<contacts>> = {
  getAll: async () => {
    return await prisma.contacts.findMany({
      include
    });
  },
  getOne: async (id: string) => {
    const item = await prisma.contacts.findFirst({
      where: { ID: id },
      include
    });

    return item;
  },
  create: async (_data: Partial<contacts>): Promise<contacts> => {
      throw new Error("Create failed");
      // try {
        //   const createresult = await prisma.contacts.create({ data: _data });

    //   if (createresult) {
    //     const newSectieIdResult = await prisma.fietsenstalling_sectie.aggregate({
    //       _max: {
    //         sectieId: true
    //       }
    //     });
    //     const sectieId = newSectieIdResult._max.sectieId !== null ? newSectieIdResult._max.sectieId + 1 : 1;
    //     const sectiedata: fietsenstalling_sectie = {
    //       fietsenstallingsId: createresult.ID,
    //       sectieId,
    //       titel: 'sectie 1',
    //       isactief: true,
    //       externalId: null,
    //       omschrijving: null,
    //       capaciteit: null,
    //       CapaciteitBromfiets: null,
    //       kleur: "",
    //       isKluis: false,
    //       reserveringskostenPerDag: null,
    //       urlwebservice: null,
    //       Reservable: false,
    //       NotaVerwijssysteem: null,
    //       Bezetting: 0,
    //       qualificatie: null
    //     }

    //     await prisma.fietsenstalling_sectie.create({ data: sectiedata });
    //     const allTypes = await prisma.fietstypen.findMany();
    //     for (let typedata of allTypes) {
    //       const newSubSectieIdResult = await prisma.sectie_fietstype.aggregate({
    //         _max: {
    //           SectionBiketypeID: true
    //         }
    //       });
    //       const subSectieId = newSubSectieIdResult._max.SectionBiketypeID !== null ? newSubSectieIdResult._max.SectionBiketypeID + 1 : 1;
    //       const subsectiedata: sectie_fietstype = {
    //         SectionBiketypeID: subSectieId,
    //         Capaciteit: 0,
    //         Toegestaan: true,
    //         sectieID: sectieId,
    //         StallingsID: createresult.ID,
    //         BikeTypeID: typedata.ID
    //       }
    //       await prisma.sectie_fietstype.create({ data: subsectiedata });
    //     };
    //   }

    //   return createresult;
    // } catch (error) {
    //   console.error("### create error", error);
    //   throw new Error("Create failed");
    // }
  },
  update: async (
    _id: string,
    _data: Partial<contacts>
  ): Promise<contacts> => {
    try {
      const result = await prisma.contacts.update({
        where: { ID: _id },
        data: _data,
      });

      return result;
    } catch (error) {
      console.error("### update error", error);
      throw new Error("Update failed");
    }
    // throw new Error("Function not implemented.");
  },
  delete: async (_id: string): Promise<contacts> => {
    try {
      return await prisma.contacts.delete({ where: { ID: _id } });
    } catch (error) {
      console.error("### delete error", error);
      throw new Error("Function not implemented.");
    }
  },
};

export default ContactsService;
