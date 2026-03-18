import { prisma } from "~/server/db";

/**
 * Create parkingsimulation tables. Same pattern as cache tables (TransactionsCacheActions etc).
 * Uses CREATE TABLE IF NOT EXISTS and raw SQL - no migration files.
 */
export async function createParkingsimulationTables(): Promise<boolean> {
  const statements = [
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
      \`useLocalProcessor\` BOOLEAN NOT NULL DEFAULT false,
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
      \`createdAt\` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
      \`updatedAt\` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0) ON UPDATE CURRENT_TIMESTAMP(0),
      UNIQUE INDEX \`parkingsimulation_section_assignments_bicycleId_key\`(\`bicycleId\`),
      INDEX \`parkingsimulation_section_assignments_location_idx\`(\`simulationConfigId\`, \`locationid\`, \`sectionid\`),
      INDEX \`parkingsimulation_section_assignments_bicycleId_idx\`(\`bicycleId\`),
      PRIMARY KEY (\`id\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `ALTER TABLE \`parkingsimulation_bicycles\` ADD CONSTRAINT \`parkingsimulation_bicycles_simulationConfigId_fkey\` FOREIGN KEY (\`simulationConfigId\`) REFERENCES \`parkingsimulation_simulation_config\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE \`parkingsimulation_section_assignments\` ADD CONSTRAINT \`parkingsimulation_section_assignments_simulationConfigId_fkey\` FOREIGN KEY (\`simulationConfigId\`) REFERENCES \`parkingsimulation_simulation_config\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
    `ALTER TABLE \`parkingsimulation_section_assignments\` ADD CONSTRAINT \`parkingsimulation_section_assignments_bicycleId_fkey\` FOREIGN KEY (\`bicycleId\`) REFERENCES \`parkingsimulation_bicycles\`(\`id\`) ON DELETE CASCADE ON UPDATE CASCADE`,
  ];

  try {
    for (const stmt of statements) {
      try {
        await prisma.$executeRawUnsafe(stmt);
      } catch (alterErr) {
        const msg = alterErr instanceof Error ? alterErr.message : String(alterErr);
        if (stmt.startsWith("ALTER TABLE") && (msg.includes("Duplicate") || msg.includes("already exists"))) {
          continue;
        }
        throw alterErr;
      }
    }
    return true;
  } catch (e) {
    console.error("Unable to create parkingsimulation tables", e);
    return false;
  }
}
