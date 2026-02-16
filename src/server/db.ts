import { PrismaClient } from "~/generated/prisma-client";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Only create and store if it doesn't exist yet
if (!globalForPrisma.prisma) {
  globalForPrisma.prisma = new PrismaClient({
    log: ["error"],
  });
}

// Always export the singleton instance
export const prisma = globalForPrisma.prisma;