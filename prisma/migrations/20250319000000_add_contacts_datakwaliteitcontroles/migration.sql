-- CreateTable
CREATE TABLE `contacts_datakwaliteitcontroles` (
    `id` VARCHAR(36) NOT NULL,
    `createdAt` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `contact_id` VARCHAR(35) NOT NULL,
    `user_id` VARCHAR(35) NOT NULL,

    INDEX `contacts_datakwaliteitcontroles_contact_id_idx`(`contact_id`),
    INDEX `contacts_datakwaliteitcontroles_user_id_idx`(`user_id`),
    INDEX `contacts_datakwaliteitcontroles_createdAt_idx`(`createdAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `contacts_datakwaliteitcontroles` ADD CONSTRAINT `contacts_datakwaliteitcontroles_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`ID`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `contacts_datakwaliteitcontroles` ADD CONSTRAINT `contacts_datakwaliteitcontroles_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `security_users`(`UserID`) ON DELETE RESTRICT ON UPDATE RESTRICT;
