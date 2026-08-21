import { prisma } from "~/server/db";

/**
 * Create Next.js FMS input queues (new_wachtrij_*). Uses CREATE TABLE IF NOT EXISTS.
 */
export async function createNewFmsTables(): Promise<boolean> {
  const statements = [
    `CREATE TABLE IF NOT EXISTS \`new_wachtrij_pasids\` (
      \`ID\` INTEGER NOT NULL AUTO_INCREMENT,
      \`transactionDate\` TIMESTAMP(0) NULL,
      \`bikeparkID\` VARCHAR(8) NOT NULL,
      \`passID\` VARCHAR(35) NOT NULL,
      \`barcode\` VARCHAR(35) NOT NULL,
      \`RFID\` VARCHAR(35) NOT NULL,
      \`RFIDBike\` VARCHAR(35) NOT NULL,
      \`biketypeID\` INTEGER NULL,
      \`bike\` TEXT NOT NULL,
      \`processed\` TINYINT(1) NOT NULL DEFAULT 0,
      \`processDate\` TIMESTAMP(0) NULL,
      \`error\` TEXT NULL,
      \`DateCreated\` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
      INDEX \`new_wp_processed\`(\`processed\`),
      UNIQUE INDEX \`new_wp_uk_transactionDate\`(\`transactionDate\`, \`bikeparkID\`, \`passID\`, \`barcode\`),
      PRIMARY KEY (\`ID\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS \`new_wachtrij_betalingen\` (
      \`ID\` INTEGER NOT NULL AUTO_INCREMENT,
      \`bikeparkID\` VARCHAR(8) NOT NULL,
      \`passID\` VARCHAR(35) NOT NULL,
      \`idtype\` INTEGER NULL,
      \`transactionDate\` DATETIME(0) NOT NULL,
      \`paymentTypeID\` INTEGER NOT NULL,
      \`amount\` DECIMAL(8, 2) NOT NULL,
      \`processed\` TINYINT(1) NOT NULL DEFAULT 0,
      \`processDate\` TIMESTAMP(0) NULL,
      \`error\` TEXT NULL,
      \`dateCreated\` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
      UNIQUE INDEX \`new_wb_bikeparkID\`(\`bikeparkID\`, \`passID\`, \`transactionDate\`, \`paymentTypeID\`, \`amount\`),
      PRIMARY KEY (\`ID\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS \`new_wachtrij_sync\` (
      \`ID\` INTEGER NOT NULL AUTO_INCREMENT,
      \`bikes\` LONGTEXT NOT NULL,
      \`bikeparkID\` VARCHAR(8) NOT NULL,
      \`sectionID\` VARCHAR(13) NOT NULL,
      \`transactionDate\` DATETIME(0) NULL,
      \`processed\` INTEGER NOT NULL DEFAULT 0,
      \`processDate\` TIMESTAMP(0) NULL,
      \`error\` TEXT NULL,
      \`dateCreated\` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
      INDEX \`new_ws_bikeparkID\`(\`bikeparkID\`),
      INDEX \`new_ws_processed\`(\`processed\`),
      INDEX \`new_ws_sectionID\`(\`sectionID\`),
      INDEX \`new_ws_transactionDate\`(\`transactionDate\`),
      PRIMARY KEY (\`ID\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS \`new_wachtrij_managed_transacties\` (
      \`ID\` INTEGER NOT NULL AUTO_INCREMENT,
      \`bikeparkID\` VARCHAR(8) NOT NULL,
      \`externalTransactionID\` VARCHAR(100) NOT NULL,
      \`payload\` TEXT NOT NULL,
      \`processed\` TINYINT(1) NOT NULL DEFAULT 0,
      \`processDate\` TIMESTAMP(0) NULL,
      \`error\` TEXT NULL,
      \`dateCreated\` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
      INDEX \`new_wmt_bikeparkID\`(\`bikeparkID\`),
      INDEX \`new_wmt_externalTransactionID\`(\`externalTransactionID\`),
      INDEX \`new_wmt_processed\`(\`processed\`),
      PRIMARY KEY (\`ID\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
    `CREATE TABLE IF NOT EXISTS \`new_bezettingsdata_tmp\` (
      \`ID\` INT NOT NULL AUTO_INCREMENT,
      \`timestampStartInterval\` DATETIME(0) NULL,
      \`timestamp\` DATETIME(0) NULL,
      \`interval\` INT NOT NULL DEFAULT 1,
      \`source\` VARCHAR(25) NULL,
      \`bikeparkID\` VARCHAR(8) NULL,
      \`sectionID\` VARCHAR(13) NULL,
      \`brutoCapacity\` INT NULL,
      \`capacity\` INT NULL,
      \`bulkreserveration\` INT NOT NULL DEFAULT 0,
      \`occupation\` INT NULL,
      \`checkins\` INT NULL,
      \`checkouts\` INT NULL,
      \`open\` BIT(1) NULL,
      \`rawData\` TEXT NULL,
      \`dateModified\` TIMESTAMP(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
      UNIQUE INDEX \`new_bdt_timestamp_2\`(\`timestamp\`, \`interval\`, \`source\`, \`bikeparkID\`, \`sectionID\`),
      INDEX \`new_bdt_bikeparkID\`(\`bikeparkID\`),
      INDEX \`new_bdt_dateModified\`(\`dateModified\`),
      INDEX \`new_bdt_interval\`(\`interval\`),
      INDEX \`new_bdt_sectionID\`(\`sectionID\`),
      INDEX \`new_bdt_source\`(\`source\`),
      INDEX \`new_bdt_timestamp\`(\`timestamp\`),
      PRIMARY KEY (\`ID\`)
    ) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`,
  ];

  try {
    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt);
    }
    return true;
  } catch (e) {
    console.error("Unable to create new_wachtrij_* FMS tables", e);
    return false;
  }
}
