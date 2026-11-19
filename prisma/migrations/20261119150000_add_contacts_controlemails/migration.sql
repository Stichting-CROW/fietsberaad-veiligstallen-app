-- CreateTable
CREATE TABLE `contacts_controlemails` (
    `id` VARCHAR(36) NOT NULL,
    `sentAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `contact_id` VARCHAR(35) NOT NULL,
    `user_id` VARCHAR(35) NOT NULL,
    `recipient` VARCHAR(255) NOT NULL,
    `source` VARCHAR(10) NOT NULL,

    INDEX `contacts_controlemails_contact_id_user_id_sentAt_idx`(`contact_id`, `user_id`, `sentAt`),
    INDEX `contacts_controlemails_sentAt_idx`(`sentAt`),
    PRIMARY KEY (`id`)
);

-- AddForeignKey
ALTER TABLE `contacts_controlemails` ADD CONSTRAINT `contacts_controlemails_contact_id_fkey` FOREIGN KEY (`contact_id`) REFERENCES `contacts`(`ID`) ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE `contacts_controlemails` ADD CONSTRAINT `contacts_controlemails_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `security_users`(`UserID`) ON DELETE RESTRICT ON UPDATE RESTRICT;
