PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL
);
--> statement-breakpoint
INSERT INTO `__new_verification`("id", "identifier", "value", "expiresAt", "createdAt", "updatedAt") SELECT "id", "identifier", "value", "expiresAt", "createdAt", "updatedAt" FROM `verification`;--> statement-breakpoint
DROP TABLE `verification`;--> statement-breakpoint
ALTER TABLE `__new_verification` RENAME TO `verification`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_verification_identifier` ON `verification` (`identifier`);--> statement-breakpoint
CREATE TABLE `__new_accessCode` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`role` text DEFAULT 'teacher' NOT NULL,
	`createdBy` text NOT NULL,
	`usedBy` text,
	`usedAt` integer,
	`expiresAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "check_accessCode_role" CHECK("__new_accessCode"."role" IN ('teacher', 'admin', 'super_admin'))
);
--> statement-breakpoint
INSERT INTO `__new_accessCode`("id", "code", "role", "createdBy", "usedBy", "usedAt", "expiresAt", "createdAt") SELECT "id", "code", "role", "createdBy", "usedBy", "usedAt", "expiresAt", "createdAt" FROM `accessCode`;--> statement-breakpoint
DROP TABLE `accessCode`;--> statement-breakpoint
ALTER TABLE `__new_accessCode` RENAME TO `accessCode`;--> statement-breakpoint
CREATE UNIQUE INDEX `accessCode_code_unique` ON `accessCode` (`code`);--> statement-breakpoint
CREATE INDEX `idx_accessCode_usedBy` ON `accessCode` (`usedBy`);--> statement-breakpoint
CREATE INDEX `idx_course_visibility` ON `course` (`visibility`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_message_conversation_sortOrder` ON `message` (`conversationId`,`sortOrder`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_observerMessage_conversation_sortOrder` ON `observerMessage` (`conversationId`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `idx_scenarioAgent_scenarioId_sortOrder` ON `scenarioAgent` (`scenarioId`,`sortOrder`);