import { prisma } from "~/server/db";

const PARKINGSIMULATION_CREATE_STATEMENTS = [
    `CREATE TABLE IF NOT EXISTS \`parkingsimulation_simulation_config\` (
      \`id\` VARCHAR(36) NOT NULL,
      \`siteID\` VARCHAR(35) NOT NULL,
      \`apiUsername\` VARCHAR(255) NULL,
      \`apiPasswordEncrypted\` VARCHAR(255) NULL,
      \`baseUrl\` VARCHAR(500) NULL,
      \`processQueueBaseUrl\` VARCHAR(500) NULL,
      \`defaultBiketypeID\` INTEGER NOT NULL DEFAULT 1,
      \`defaultIdtype\` INTEGER NOT NULL DEFAULT 0,
      \`simulationTimeOffsetSeconds\` INTEGER NOT NULL DEFAULT 0,
      \`simulationStartDate\` DATETIME(0) NULL,
      \`useLocalProcessor\` BOOLEAN NOT NULL DEFAULT true,
      \`createdAt\` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
      \`updatedAt\` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
      UNIQUE INDEX \`parkingsimulation_simulation_config_siteID_key\`(\`siteID\`),
      INDEX \`parkingsimulation_simulation_config_siteID_idx\`(\`siteID\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS \`parkingsimulation_bicycles\` (
      \`id\` VARCHAR(36) NOT NULL,
      \`simulationConfigId\` VARCHAR(36) NOT NULL,
      \`barcode\` VARCHAR(50) NOT NULL,
      \`RFIDBike\` VARCHAR(50) NULL,
      \`passID\` VARCHAR(50) NULL,
      \`RFID\` VARCHAR(50) NULL,
      \`biketypeID\` INTEGER NOT NULL DEFAULT 1,
      \`status\` VARCHAR(20) NOT NULL DEFAULT 'available',
      \`createdAt\` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
      \`updatedAt\` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
      INDEX \`parkingsimulation_bicycles_simulationConfigId_idx\`(\`simulationConfigId\`),
      INDEX \`parkingsimulation_bicycles_barcode_idx\`(\`barcode\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS \`parkingsimulation_section_assignments\` (
      \`id\` VARCHAR(36) NOT NULL,
      \`simulationConfigId\` VARCHAR(36) NOT NULL,
      \`bicycleId\` VARCHAR(36) NOT NULL,
      \`locationid\` VARCHAR(35) NOT NULL,
      \`sectionid\` VARCHAR(35) NOT NULL,
      \`checkedIn\` BOOLEAN NOT NULL DEFAULT false,
      \`passID\` VARCHAR(36) NULL,
      \`externalTransactionID\` VARCHAR(100) NULL,
      \`checkInDate\` DATETIME(0) NULL,
      \`createdAt\` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
      \`updatedAt\` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
      UNIQUE INDEX \`parkingsimulation_section_assignments_bicycleId_key\`(\`bicycleId\`),
      INDEX \`parkingsimulation_section_assignments_location_idx\`(\`simulationConfigId\`, \`locationid\`, \`sectionid\`),
      INDEX \`parkingsimulation_section_assignments_bicycleId_idx\`(\`bicycleId\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
];

const PARKINGSIMULATION_FKS: Array<{ name: string; sql: string }> = [
  {
    name: "parkingsimulation_bicycles_simulationConfigId_fkey",
    sql: `ALTER TABLE \`parkingsimulation_bicycles\` ADD CONSTRAINT \`parkingsimulation_bicycles_simulationConfigId_fkey\` FOREIGN KEY (\`simulationConfigId\`) REFERENCES \`parkingsimulation_simulation_config\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
  },
  {
    name: "parkingsimulation_section_assignments_simulationConfigId_fkey",
    sql: `ALTER TABLE \`parkingsimulation_section_assignments\` ADD CONSTRAINT \`parkingsimulation_section_assignments_simulationConfigId_fkey\` FOREIGN KEY (\`simulationConfigId\`) REFERENCES \`parkingsimulation_simulation_config\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
  },
  {
    name: "parkingsimulation_section_assignments_bicycleId_fkey",
    sql: `ALTER TABLE \`parkingsimulation_section_assignments\` ADD CONSTRAINT \`parkingsimulation_section_assignments_bicycleId_fkey\` FOREIGN KEY (\`bicycleId\`) REFERENCES \`parkingsimulation_bicycles\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
  },
];

const PARKINGSIMULATION_COLUMNS: Array<{ table: string; column: string; sql: string }> = [
  {
    table: "parkingsimulation_section_assignments",
    column: "externalTransactionID",
    sql: `ALTER TABLE \`parkingsimulation_section_assignments\` ADD COLUMN \`externalTransactionID\` VARCHAR(100) NULL`,
  },
  {
    table: "parkingsimulation_section_assignments",
    column: "checkInDate",
    sql: `ALTER TABLE \`parkingsimulation_section_assignments\` ADD COLUMN \`checkInDate\` DATETIME(0) NULL`,
  },
];

async function constraintExists(name: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*) AS n FROM information_schema.TABLE_CONSTRAINTS
     WHERE CONSTRAINT_SCHEMA = DATABASE() AND CONSTRAINT_NAME = ?`,
    name
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
    `SELECT COUNT(*) AS n FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    table,
    column
  );
  return Number(rows[0]?.n ?? 0) > 0;
}

/**
 * Create parkingsimulation tables. Same pattern as cache tables (TransactionsCacheActions etc).
 * Uses CREATE TABLE IF NOT EXISTS and raw SQL - no migration files.
 * FKs and late-added columns are applied only when missing (reset calls this every time).
 */
export async function createParkingsimulationTables(): Promise<boolean> {
  const statements = PARKINGSIMULATION_CREATE_STATEMENTS.map((s) =>
    s.endsWith(";") ? s.slice(0, -1) : s
  );
  try {
    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt);
    }
    for (const col of PARKINGSIMULATION_COLUMNS) {
      if (!(await columnExists(col.table, col.column))) {
        await prisma.$executeRawUnsafe(col.sql);
      }
    }
    for (const fk of PARKINGSIMULATION_FKS) {
      if (!(await constraintExists(fk.name))) {
        await prisma.$executeRawUnsafe(fk.sql);
      }
    }
    return true;
  } catch (e) {
    console.error("Unable to create parkingsimulation tables", e);
    return false;
  }
}
