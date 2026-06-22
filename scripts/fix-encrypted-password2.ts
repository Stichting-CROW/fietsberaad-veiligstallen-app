/**
 * Identify and fix bad `security_users.EncryptedPassword2` entries.
 *
 * Background
 * ----------
 * The legacy ColdFusion remote.veiligstallen.nl HTTP Basic Auth API authenticates
 * `security_users` accounts against the SHA-256 hash stored in `EncryptedPassword2`
 * (NOT the bcrypt hash in `EncryptedPassword`). Users created/edited through the
 * Next.js UI used to leave `EncryptedPassword2` empty (or, via the password-setup
 * flow, filled it with a bcrypt hash). Either way those accounts could never
 * authenticate against the old API.
 *
 * What "bad" means here: `EncryptedPassword2` is NULL/empty, or it is not a valid
 * 64-character hex SHA-256 digest (e.g. it still holds a `$2a$...` bcrypt hash).
 *
 * IMPORTANT: bcrypt is a one-way hash, so we CANNOT recompute the correct SHA-256
 * value without the plaintext password. Instead, this script normalizes broken
 * values so that the Next.js login flow repopulates them automatically (the login
 * flow now lazily backfills EncryptedPassword2 on the next successful login).
 *
 * Modes:
 *   1. (default) identify  - list affected accounts, no changes.
 *   2. --clear-invalid     - null out non-empty *malformed* EncryptedPassword2
 *                            values so they get repopulated automatically the
 *                            next time the user logs in via the Next.js app.
 *
 * The --clear-invalid mode is DRY-RUN by default. Add --apply to actually write.
 *
 * Usage:
 *   npx tsx scripts/fix-encrypted-password2.ts
 *   npx tsx scripts/fix-encrypted-password2.ts --clear-invalid
 *   npx tsx scripts/fix-encrypted-password2.ts --clear-invalid --apply
 *
 * Requires: DATABASE_URL in .env, database reachable.
 */

import { PrismaClient } from "../src/generated/prisma-client";
import { isValidApiPasswordHash } from "../src/utils/server/password-tools";

const prisma = new PrismaClient();

type Category = "valid" | "empty" | "bcrypt" | "malformed";

const categorize = (value: string | null | undefined): Category => {
  if (!value) return "empty";
  if (isValidApiPasswordHash(value)) return "valid";
  if (/^\$2[aby]\$/.test(value)) return "bcrypt";
  return "malformed";
};

type Args = {
  apply: boolean;
  clearInvalid: boolean;
};

const parseArgs = (): Args => {
  const argv = process.argv.slice(2);
  const args: Args = { apply: false, clearInvalid: false };

  for (const a of argv) {
    switch (a) {
      case "--apply":
        args.apply = true;
        break;
      case "--clear-invalid":
        args.clearInvalid = true;
        break;
      case "--help":
      case "-h":
        printHelp();
        process.exit(0);
        break;
      default:
        throw new Error(`Unknown argument: ${a}`);
    }
  }
  return args;
};

const printHelp = () => {
  console.log(`
Fix bad security_users.EncryptedPassword2 entries.

Modes:
  (no args)             Identify and report affected accounts (read-only)
  --clear-invalid       Null out non-empty malformed EncryptedPassword2 values
                        (they self-heal on next Next.js login via backfill)

Flags:
  --apply               Actually write changes (default is dry-run)
  -h, --help            Show this help
`);
};

const runIdentify = async () => {
  const users = await prisma.security_users.findMany({
    select: { UserID: true, UserName: true, DisplayName: true, Status: true, RoleID: true, EncryptedPassword2: true },
    orderBy: { UserName: "asc" },
  });

  const counts: Record<Category, number> = { valid: 0, empty: 0, bcrypt: 0, malformed: 0 };
  const bad: { UserName: string; UserID: string; Status: string | null; RoleID: number | null; category: Category }[] = [];

  for (const u of users) {
    const cat = categorize(u.EncryptedPassword2);
    counts[cat] += 1;
    if (cat !== "valid") {
      bad.push({ UserName: u.UserName ?? "(no username)", UserID: u.UserID, Status: u.Status, RoleID: u.RoleID, category: cat });
    }
  }

  console.log(`\nScanned ${users.length} security_users records.`);
  console.log(`  valid (SHA-256 hex): ${counts.valid}`);
  console.log(`  empty/null:          ${counts.empty}`);
  console.log(`  bcrypt-shaped:       ${counts.bcrypt}`);
  console.log(`  other malformed:     ${counts.malformed}`);

  if (bad.length === 0) {
    console.log(`\nAll EncryptedPassword2 entries look valid. Nothing to do.`);
    return;
  }

  console.log(`\n${bad.length} account(s) cannot authenticate against the ColdFusion API:\n`);
  for (const b of bad) {
    console.log(`  [${b.category.padEnd(9)}] ${b.UserName}  (UserID=${b.UserID}, Status=${b.Status ?? "?"}, RoleID=${b.RoleID ?? "?"})`);
  }

  console.log(`
Notes:
  - bcrypt is one-way, so empty/bcrypt/malformed entries cannot be repaired
    automatically without the plaintext password.
  - These accounts will self-heal the next time the user logs in via the
    Next.js app (login now backfills EncryptedPassword2).
  - Use --clear-invalid to null out non-empty malformed values so they are in a
    clean state for that backfill.
`);
};

const runClearInvalid = async (apply: boolean) => {
  const users = await prisma.security_users.findMany({
    select: { UserID: true, UserName: true, EncryptedPassword2: true },
  });

  // Only target NON-empty malformed/bcrypt values; empty values are already in
  // the "needs backfill" state and don't need touching.
  const targets = users.filter((u) => {
    const cat = categorize(u.EncryptedPassword2);
    return cat === "bcrypt" || cat === "malformed";
  });

  if (targets.length === 0) {
    console.log(`No non-empty malformed EncryptedPassword2 values found. Nothing to clear.`);
    return;
  }

  console.log(`${targets.length} account(s) have a non-empty malformed EncryptedPassword2 that will be cleared (set to ''):\n`);
  for (const t of targets) {
    console.log(`  ${t.UserName ?? "(no username)"} (UserID=${t.UserID})`);
  }

  if (!apply) {
    console.log(`\nDry-run. Re-run with --apply to clear these values.`);
    console.log(`After clearing, each account self-heals on its next Next.js login.`);
    return;
  }

  let updated = 0;
  for (const t of targets) {
    await prisma.security_users.update({
      where: { UserID: t.UserID },
      data: { EncryptedPassword2: "" },
    });
    updated += 1;
  }
  console.log(`\nCleared EncryptedPassword2 for ${updated} account(s). They will self-heal on next login.`);
};

const main = async () => {
  const args = parseArgs();

  if (args.clearInvalid) {
    await runClearInvalid(args.apply);
  } else {
    await runIdentify();
  }
};

main()
  .catch((err) => {
    console.error("Error:", err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(() => {
    void prisma.$disconnect();
  });
