import * as crypto from 'crypto';

/**
 * Validates a bearer token against the configured environment variable.
 * Uses constant-time comparison to prevent timing attacks.
 * 
 * @param token - The bearer token to validate
 * @returns true if token is valid, false otherwise
 */
export function validateBearerToken(token: string): boolean {
  const expectedToken = process.env.UPDATE_CACHE_BEARER_TOKEN;
  
  if (!expectedToken) {
    console.error("UPDATE_CACHE_BEARER_TOKEN not configured");
    return false;
  }
  
  if (!token) {
    return false;
  }
  
  // Ensure both tokens are the same length before comparison
  // This prevents timing attacks by ensuring comparison always takes the same time
  if (token.length !== expectedToken.length) {
    return false;
  }
  
  // Use constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(token),
      Buffer.from(expectedToken)
    );
  } catch (error) {
    console.error("Error comparing bearer tokens:", error);
    return false;
  }
}

