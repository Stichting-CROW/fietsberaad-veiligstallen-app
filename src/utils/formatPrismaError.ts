/**
 * Formats Prisma errors to show only essential information
 * Removes verbose stack traces and minified code
 */
export function formatPrismaError(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error);
  }

  // Check if it's a Prisma error (has code property)
  const prismaError = error as Error & {
    code?: string;
    meta?: Record<string, unknown>;
    clientVersion?: string;
  };

  // Extract essential information
  const parts: string[] = [];

  // Error name/type
  parts.push(`[${error.name}]`);

  // Prisma error code if available
  if (prismaError.code) {
    parts.push(`Code: ${prismaError.code}`);
  }

  // Main error message (clean it up if it contains verbose stack traces)
  let message = error.message;
  
  // Remove common verbose patterns
  message = message
    .split('\n')[0]?.trim() || '' // Take only first line and trim whitespace
    .replace(/at .*?\(.*?\)/g, '') // Remove stack trace lines
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // If message is still very long, truncate it
  if (message.length > 500) {
    message = message.substring(0, 500) + '...';
  }

  parts.push(message);

  // Add relevant meta information if available
  if (prismaError.meta) {
    const relevantMeta: string[] = [];
    
    // Extract only useful meta fields
    if (prismaError.meta.target) {
      relevantMeta.push(`target: ${JSON.stringify(prismaError.meta.target)}`);
    }
    if (prismaError.meta.cause) {
      const cause = String(prismaError.meta.cause);
      if (cause.length < 200) {
        relevantMeta.push(`cause: ${cause}`);
      }
    }
    
    if (relevantMeta.length > 0) {
      parts.push(`Meta: ${relevantMeta.join(', ')}`);
    }
  }

  return parts.join(' | ');
}

/** Max length for compact API error messages */
const COMPACT_MAX_LEN = 180;

/**
 * Returns a short error string for API responses (no stack traces, no verbose Prisma output).
 */
export function formatPrismaErrorCompact(error: unknown): string {
  if (!(error instanceof Error)) {
    return String(error).slice(0, COMPACT_MAX_LEN);
  }

  const prismaError = error as Error & {
    code?: string;
    meta?: { target?: string | string[]; modelName?: string; field_name?: string };
  };

  if (prismaError.code === "P2002") {
    const target = prismaError.meta?.target;
    const t = Array.isArray(target) ? target.join(", ") : target ?? "";
    return `Unieke waarde bestaat al${t ? ` (${t})` : ""}`;
  }
  if (prismaError.code === "P2003") {
    const field = prismaError.meta?.field_name ?? prismaError.meta?.target;
    const f = Array.isArray(field) ? field.join(", ") : field;
    return `Referentie ontbreekt${f ? ` (${f})` : ""}`;
  }
  if (prismaError.code) {
    const msg = error.message
      .replace(/Invalid `prisma\.[^`]+`[^:]*:\s*/i, "")
      .replace(/\s+/g, " ")
      .trim();
    const short = msg.length > 80 ? msg.slice(0, 77) + "..." : msg;
    return `${prismaError.code}: ${short}`;
  }

  // Strip Prisma invocation prefix, take first meaningful line
  let msg = error.message
    .replace(/Invalid `prisma\.[^`]+`[^:]*:\s*/i, "")
    .replace(/\s+/g, " ")
    .trim();
  const firstLine = msg.split("\n")[0]?.trim() ?? msg;
  return firstLine.length > COMPACT_MAX_LEN ? firstLine.slice(0, COMPACT_MAX_LEN - 3) + "..." : firstLine;
}

/**
 * Logs a Prisma error in a compact format (for terminal/console output)
 */
export function logPrismaError(context: string, error: unknown): void {
  const formatted = formatPrismaErrorCompact(error);
  console.error(`[${context}] ${formatted}`);
}

/**
 * Error response type for API handlers
 */
export type PrismaErrorResponse = {
  error: string;
  details: string;
  code?: string;
  formattedError?: string;
};

/**
 * Handles Prisma errors and returns appropriate HTTP response data
 * This function should be used in Next.js API route catch blocks
 * 
 * @param context - Context string for logging (e.g., "database/[actionType]")
 * @param error - The error object caught in the catch block
 * @returns Object with status code and response data, or null if not a Prisma error
 */
export function handlePrismaError(
  context: string,
  error: unknown
): { status: number; response: PrismaErrorResponse } | null {
  // Log the error first
  logPrismaError(context, error);

  // Check if it's a Prisma error
  if (!error || typeof error !== 'object' || !('code' in error)) {
    return null;
  }

  const prismaError = error as { code?: string; meta?: any; message?: string };

  // Check for SQL permission errors (MySQL error code 1142)
  const errorMessage = prismaError.message || "";
  if (errorMessage.includes('1142') || errorMessage.includes('ALTER command denied')) {
    return {
      status: 403,
      response: {
        error: "Database permission denied",
        details: "The database user does not have permission to execute this operation. Please contact your database administrator.",
        code: prismaError.code,
        formattedError: formatPrismaError(error)
      }
    };
  }

  // Check for known Prisma error codes
  if (prismaError.code === 'P2003' || prismaError.code === 'P2014') {
    // Foreign key constraint or relation violation
    return {
      status: 400,
      response: {
        error: "Database constraint violation",
        details: formatPrismaError(error),
        code: prismaError.code
      }
    };
  }

  if (prismaError.code === 'P2002') {
    // Unique constraint violation
    return {
      status: 400,
      response: {
        error: "Duplicate entry",
        details: formatPrismaError(error),
        code: prismaError.code
      }
    };
  }

  if (prismaError.code && prismaError.code.startsWith('P')) {
    // Other Prisma errors
    return {
      status: 500,
      response: {
        error: "Database error",
        details: formatPrismaError(error),
        code: prismaError.code
      }
    };
  }

  return null;
}

/**
 * Handles any error (Prisma or otherwise) and returns appropriate HTTP response data
 * This is a convenience function that handles both Prisma and non-Prisma errors
 * 
 * @param context - Context string for logging (e.g., "database/[actionType]")
 * @param error - The error object caught in the catch block
 * @returns Object with status code and response data
 */
export function handleApiError(
  context: string,
  error: unknown
): { status: number; response: PrismaErrorResponse } {
  // Try Prisma error handling first
  const prismaErrorResponse = handlePrismaError(context, error);
  if (prismaErrorResponse) {
    return prismaErrorResponse;
  }

  // Handle other error types
  const errorMessage = error instanceof Error ? error.message : String(error);
  return {
    status: 500,
    response: {
      error: "Internal server error",
      details: formatPrismaError(error)
    }
  };
}

