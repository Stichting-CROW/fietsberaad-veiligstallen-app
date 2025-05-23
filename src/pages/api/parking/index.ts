import type { NextApiRequest, NextApiResponse } from "next";
import {
  Prisma,
  type fietsenstallingen,
} from "~/generated/prisma-client";
import { prisma } from "~/server/db";
import { ParkingDetailsType, selectParkingDetailsType } from "~/types/parking";

const fixFieldsForParking = (parking: Partial<fietsenstallingen>) => {
  for (const [key, prop] of Object.entries(parking)) {
    if (prop instanceof Date) {
      (parking as any)[key] = prop.toString();
    }
    if (prop instanceof BigInt) {
      (parking as any)[key] = prop.toString();
    }
    if (prop instanceof Prisma.Decimal) {
      delete (parking as any)[key];
    }
  }
  delete (parking as any).reservationCostPerDay;
  delete (parking as any).wachtlijst_Id;
};

export default async function handle(
  req: NextApiRequest,
  res: NextApiResponse
) {
  if (req.method === "GET") {
    if ("stallingid" in req.query) {
      const stallingId: string = req.query.stallingid as string;

      const parking = (await prisma.fietsenstallingen.findFirst({
        where: {
          ID: stallingId,
        },
        select: selectParkingDetailsType
      })) as Partial<fietsenstallingen>;

      if (parking !== null) {
        fixFieldsForParking(parking);
      }

      // console.log("#### parking fixed", JSON.stringify(parking,0,2));

      const parkingDetails = parking as ParkingDetailsType;
      // TODO: check type agains the ParkingDetailsType

      res.status(200).json(parkingDetails);
      } else {
        // let allcapacity = [];


      // const parkings = await prisma.fietsenstallingen.findMany({
      //   select: { ID: true, Title: true, Plaats: true },
      //   take: 100,
      // });
      // for (let parking of parkings) {
      //   const capacity = await getCapacityDataForParking(parking.ID);
      //   getCapacityDataForParkingif (capacity) {
      //     allcapacity.push({
      //       ID: parking.ID,
      //       Title: parking.Title,
      //       Plaats: parking.Plaats,
      //       data: capacity,
      //     });
      //   }
      // }

      // // console.log("collect capacity info");
      // allcapacity.map((capacityinfo, index) => {
      //   capacityinfo.details.map((detailinfo, index) => {
      //     console.log(`capacityinfo ${index} ${JSON.stringify(detailinfo)}`);
      //   });

      //   let capacitystr = Object.keys(capacityinfo.data);
      //   //   .map((infoitem) => {
      //   //     return `\t${infoitem.typename} - ${infoitem.allowed} - ${infoitem.capacity}`;
      //   //   })
      //   //   .join("\n");
      //   console.log(
      //     `${capacityinfo.Title}-${capacityinfo.Plaats}-${capacityinfo.data.total}\n${capacitystr}`
      //   );
      // });

      // // console.log("allcapacity", allcapacity);
      // res.status(200).json(allcapacity);
      res.status(405).end(); // Method Not Allowed
    }
  } else {
    res.status(405).end(); // Method Not Allowed
  }
}
