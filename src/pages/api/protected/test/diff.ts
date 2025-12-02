import type { NextApiRequest, NextApiResponse } from "next";
import { getServerSession } from "next-auth";
import { authOptions } from "~/pages/api/auth/[...nextauth]";
import { PrismaClient } from "~/generated/prisma-client";
import { prisma as mainPrisma } from "~/server/db";
import { getCurrentDiff } from "~/utils/databaseDiff";
import { loadCheckpoint } from "~/utils/checkpointStorage";
import { logPrismaError } from "~/utils/formatPrismaError";

export type DiffResponse = {
  success: boolean;
  legacy?: {
    [tableName: string]: Array<{
      id: string | number;
      status: 'inserted' | 'modified' | 'deleted';
      data: Record<string, any>;
    }>;
  };
  new?: {
    [tableName: string]: Array<{
      id: string | number;
      status: 'inserted' | 'modified' | 'deleted';
      data: Record<string, any>;
    }>;
  };
  warnings?: {
    legacy?: {
      [tableName: string]: {
        message: string;
        rowCount: number;
        limit: number;
      };
    };
    new?: {
      [tableName: string]: {
        message: string;
        rowCount: number;
        limit: number;
      };
    };
  };
  error?: string;
};

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<DiffResponse>
) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, error: "Method not allowed" });
  }

  // Check authentication
  const session = await getServerSession(req, res, authOptions);
  if (!session?.user) {
    return res.status(401).json({ success: false, error: "Unauthorized" });
  }

  try {
    const LEGACY_DATABASE_URL = process.env.DEV_DIFF_LEGACY_DATABASE_URL || '';
    
    // Validate database URL
    if (!LEGACY_DATABASE_URL) {
      return res.status(400).json({
        success: false,
        error: "Legacy database URL is not configured. Please set DEV_DIFF_LEGACY_DATABASE_URL in your .env file.",
      });
    }

    // Validate request body
    const { tables } = req.body;
    if (!Array.isArray(tables) || tables.length === 0 || tables.length > 5) {
      return res.status(400).json({
        success: false,
        error: "Invalid tables array. Must contain 1-5 table names.",
      });
    }

    // Load checkpoint from disk
    const checkpoint = loadCheckpoint();
    if (!checkpoint) {
      return res.status(400).json({
        success: false,
        error: "No checkpoint found. Please create a checkpoint first.",
      });
    }

    // Create PrismaClient for legacy database
    // New database always uses the existing main PrismaClient
    const legacyPrisma = new PrismaClient({
      datasources: {
        db: {
          url: LEGACY_DATABASE_URL,
        },
      },
    });

    // Always use main PrismaClient for new database (production)
    const newPrisma = mainPrisma;

    try {
      // Calculate diffs for both databases
      const [legacyResult, newResult] = await Promise.all([
        getCurrentDiff(legacyPrisma, tables, checkpoint.legacy),
        getCurrentDiff(newPrisma, tables, checkpoint.new),
      ]);

      // Build response
      const response: DiffResponse = {
        success: true,
        legacy: legacyResult.diff,
        new: newResult.diff,
      };

      // Add warnings if any
      const warnings: DiffResponse["warnings"] = {};
      if (legacyResult.warnings) {
        warnings.legacy = legacyResult.warnings;
      }
      if (newResult.warnings) {
        warnings.new = newResult.warnings;
      }
      if (Object.keys(warnings).length > 0) {
        response.warnings = warnings;
      }

      return res.status(200).json(response);
    } finally {
      // Disconnect legacy Prisma client (never disconnect main instance)
      await legacyPrisma.$disconnect();
    }
  } catch (error) {
    logPrismaError("Diff calculation", error);
    const errorMessage = error instanceof Error && error.message
      ? error.message.split('\n')[0]?.trim() ?? "Internal server error"
      : "Internal server error";
    return res.status(500).json({
      success: false,
      error: errorMessage,
    });
  }
}

