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

/**
 * Logs a Prisma error in a clean format
 */
export function logPrismaError(context: string, error: unknown): void {
  const formatted = formatPrismaError(error);
  console.error(`[${context}] ${formatted}`);
}

