-- Parking Management simulation tables (consolidated)
-- parkingmgmt_simulation_config: singleton config per testgemeente (siteID)
-- parkingmgmt_bicycles, parkingmgmt_occupation, parkingmgmt_spot_detection

CREATE TABLE `parkingmgmt_simulation_config` (
    `id` VARCHAR(36) NOT NULL,
    `siteID` VARCHAR(35) NOT NULL,
    `apiUsername` VARCHAR(255) NULL,
    `apiPasswordEncrypted` VARCHAR(255) NULL,
    `baseUrl` VARCHAR(500) NULL,
    `processQueueBaseUrl` VARCHAR(500) NULL,
    `defaultBiketypeID` INTEGER NOT NULL DEFAULT 1,
    `defaultIdtype` INTEGER NOT NULL DEFAULT 0,
    `simulationTimeOffsetSeconds` INTEGER NOT NULL DEFAULT 0,
    `simulationStartDate` DATETIME(0) NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL,

    UNIQUE INDEX `parkingmgmt_simulation_config_siteID_key`(`siteID`),
    INDEX `parkingmgmt_simulation_config_siteID_idx`(`siteID`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `parkingmgmt_bicycles` (
    `id` VARCHAR(36) NOT NULL,
    `simulationConfigId` VARCHAR(36) NOT NULL,
    `barcode` VARCHAR(50) NOT NULL,
    `RFIDBike` VARCHAR(50) NULL,
    `passID` VARCHAR(50) NULL,
    `RFID` VARCHAR(50) NULL,
    `biketypeID` INTEGER NOT NULL DEFAULT 1,
    `status` VARCHAR(20) NOT NULL DEFAULT 'available',
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updatedAt` DATETIME(0) NOT NULL,

    INDEX `parkingmgmt_bicycles_simulationConfigId_idx`(`simulationConfigId`),
    INDEX `parkingmgmt_bicycles_barcode_idx`(`barcode`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `parkingmgmt_occupation` (
    `id` VARCHAR(36) NOT NULL,
    `bicycleId` VARCHAR(36) NOT NULL,
    `locationid` VARCHAR(35) NOT NULL,
    `sectionid` VARCHAR(35) NOT NULL,
    `placeId` INTEGER NULL,
    `checkedIn` BOOLEAN NOT NULL DEFAULT false,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    INDEX `parkingmgmt_occupation_bicycleId_idx`(`bicycleId`),
    INDEX `parkingmgmt_occupation_location_idx`(`locationid`, `sectionid`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE `parkingmgmt_spot_detection` (
    `id` VARCHAR(36) NOT NULL,
    `simulationConfigId` VARCHAR(36) NOT NULL,
    `locationid` VARCHAR(35) NOT NULL,
    `sectionid` VARCHAR(35) NOT NULL,
    `placeId` INTEGER NOT NULL,
    `detected` BOOLEAN NOT NULL DEFAULT true,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),

    UNIQUE INDEX `parkingmgmt_spot_detection_uk`(`simulationConfigId`, `locationid`, `sectionid`, `placeId`),
    INDEX `parkingmgmt_spot_detection_simulationConfigId_idx`(`simulationConfigId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

ALTER TABLE `parkingmgmt_bicycles` ADD CONSTRAINT `parkingmgmt_bicycles_simulationConfigId_fkey` FOREIGN KEY (`simulationConfigId`) REFERENCES `parkingmgmt_simulation_config`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `parkingmgmt_occupation` ADD CONSTRAINT `parkingmgmt_occupation_bicycleId_fkey` FOREIGN KEY (`bicycleId`) REFERENCES `parkingmgmt_bicycles`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE `parkingmgmt_spot_detection` ADD CONSTRAINT `parkingmgmt_spot_detection_simulationConfigId_fkey` FOREIGN KEY (`simulationConfigId`) REFERENCES `parkingmgmt_simulation_config`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
