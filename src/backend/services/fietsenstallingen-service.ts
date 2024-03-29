import { prisma } from "~/server/db";
import type { fietsenstallingen } from "@prisma/client";
import type { ICrudService } from "~/backend/handlers/crud-service-interface";

// inspired by https://medium.com/@brandonlostboy/build-it-better-next-js-crud-api-b45d2e923896
const FietsenstallingenService: ICrudService<fietsenstallingen> = {
  getAll: async () => {
    return await prisma.fietsenstallingen.findMany();
  },
  getOne: async (id: string) => {
    return await prisma.fietsenstallingen.findFirst({ where: { ID: id } });
  },
  create: async (_data: fietsenstallingen): Promise<fietsenstallingen> => {
    return await prisma.fietsenstallingen.create({ data: _data });
    // throw new Error("Function not implemented.");
  },
  update: async (
    _id: string,
    _data: fietsenstallingen
  ): Promise<fietsenstallingen> => {
    return await prisma.fietsenstallingen.update({
      where: { ID: _id },
      data: _data,
    });
    // throw new Error("Function not implemented.");
  },
  delete: async (_id: string): Promise<fietsenstallingen> => {
    return await prisma.fietsenstallingen.delete({ where: { ID: _id } });
    // throw new Error("Function not implemented.");
  },
};

export default FietsenstallingenService;
