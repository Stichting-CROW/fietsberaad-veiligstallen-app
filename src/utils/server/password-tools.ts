/*
  Password helpers shared between the web login and the legacy ColdFusion
  remote.veiligstallen.nl HTTP Basic Auth API.

  The security_users table stores TWO password hashes:
    - EncryptedPassword  : bcrypt hash, used for interactive (web) login
    - EncryptedPassword2 : SHA-256 hash, used by the ColdFusion API Basic Auth
                           (bcrypt is too slow to run on every API call)

  ColdFusion fills EncryptedPassword2 via helperclass.encrypt():
      Hash(str, "SHA-256")
  which returns an UPPERCASE hex digest. We replicate that exact format here so
  the values are byte-identical to records created by the old system.
*/
import { createHash } from "crypto";

/**
 * Produce the SHA-256 hash for security_users.EncryptedPassword2 in the exact
 * format used by ColdFusion (`Hash(str, "SHA-256")`): uppercase hex.
 *
 * Note: MySQL's default collation is case-insensitive, so the API comparison
 * would also match lowercase, but we use uppercase to stay identical to the
 * legacy data.
 */
export const encryptPasswordForApi = (password: string): string => {
  return createHash("sha256").update(password, "utf8").digest("hex").toUpperCase();
};

/**
 * Returns true when the given EncryptedPassword2 value is a valid ColdFusion
 * API hash, i.e. a 64-character hex SHA-256 digest. Empty values, bcrypt hashes
 * (`$2a$...`) and any other malformed content are considered invalid and will
 * never match the ColdFusion Basic Auth query.
 */
export const isValidApiPasswordHash = (value: string | null | undefined): boolean => {
  if (!value) return false;
  return /^[0-9a-fA-F]{64}$/.test(value);
};
