import { PrismaClient } from "~/generated/prisma-client";
import { formatPrismaErrorCompact } from "~/utils/formatPrismaError";

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient };

// Only create and store if it doesn't exist yet
if (!globalForPrisma.prisma) {
  const client = new PrismaClient({
    log: [{ emit: "event", level: "error" }],
  });
  client.$on("error", (e) => {
    // Prisma error events have { message, target }; pass as Error-like for formatter
    console.error("[prisma]", formatPrismaErrorCompact(new Error(e.message)));
  });
  globalForPrisma.prisma = client;
}

// Always export the singleton instance
export const prisma = globalForPrisma.prisma;