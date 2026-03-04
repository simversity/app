PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_conversation` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`scenarioId` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`startedAt` integer NOT NULL,
	`completedAt` integer,
	`messageCount` integer DEFAULT 0 NOT NULL,
	`observerMessageCount` integer DEFAULT 0 NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scenarioId`) REFERENCES `scenario`(`id`) ON UPDATE no action ON DELETE restrict,
	CONSTRAINT "check_conversation_status" CHECK("__new_conversation"."status" IN ('active', 'completed', 'abandoned'))
);
--> statement-breakpoint
INSERT INTO `__new_conversation`("id", "userId", "scenarioId", "status", "startedAt", "completedAt", "messageCount", "observerMessageCount", "updatedAt") SELECT "id", "userId", "scenarioId", "status", "startedAt", "completedAt", "messageCount", "observerMessageCount", "updatedAt" FROM `conversation`;--> statement-breakpoint
DROP TABLE `conversation`;--> statement-breakpoint
ALTER TABLE `__new_conversation` RENAME TO `conversation`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_conversation_userId` ON `conversation` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_conversation_userId_status` ON `conversation` (`userId`,`status`);--> statement-breakpoint
CREATE INDEX `idx_conversation_scenarioId` ON `conversation` (`scenarioId`);--> statement-breakpoint
CREATE INDEX `idx_conversation_status` ON `conversation` (`status`);--> statement-breakpoint
CREATE INDEX `idx_conversation_updatedAt` ON `conversation` (`updatedAt`);--> statement-breakpoint
CREATE INDEX `idx_conversation_startedAt` ON `conversation` (`startedAt`);--> statement-breakpoint
CREATE TABLE `__new_progress` (
	`id` text PRIMARY KEY NOT NULL,
	`userId` text NOT NULL,
	`courseId` text NOT NULL,
	`scenarioId` text NOT NULL,
	`status` text DEFAULT 'not_started' NOT NULL,
	`latestConversationId` text,
	`completedAt` integer,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`courseId`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scenarioId`) REFERENCES `scenario`(`id`) ON UPDATE no action ON DELETE restrict,
	FOREIGN KEY (`latestConversationId`) REFERENCES `conversation`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "check_progress_status" CHECK("__new_progress"."status" IN ('not_started', 'in_progress', 'completed'))
);
--> statement-breakpoint
INSERT INTO `__new_progress`("id", "userId", "courseId", "scenarioId", "status", "latestConversationId", "completedAt", "updatedAt") SELECT "id", "userId", "courseId", "scenarioId", "status", "latestConversationId", "completedAt", "updatedAt" FROM `progress`;--> statement-breakpoint
DROP TABLE `progress`;--> statement-breakpoint
ALTER TABLE `__new_progress` RENAME TO `progress`;--> statement-breakpoint
CREATE INDEX `idx_progress_userId` ON `progress` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_progress_courseId` ON `progress` (`courseId`);--> statement-breakpoint
CREATE INDEX `idx_progress_userId_courseId` ON `progress` (`userId`,`courseId`);--> statement-breakpoint
CREATE INDEX `idx_progress_scenarioId` ON `progress` (`scenarioId`);--> statement-breakpoint
CREATE UNIQUE INDEX `progress_userId_scenarioId_unique` ON `progress` (`userId`,`scenarioId`);--> statement-breakpoint
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
	CONSTRAINT "check_accessCode_role" CHECK("__new_accessCode"."role" IN ('teacher', 'admin'))
);
--> statement-breakpoint
INSERT INTO `__new_accessCode`("id", "code", "role", "createdBy", "usedBy", "usedAt", "expiresAt", "createdAt") SELECT "id", "code", "role", "createdBy", "usedBy", "usedAt", "expiresAt", "createdAt" FROM `accessCode`;--> statement-breakpoint
DROP TABLE `accessCode`;--> statement-breakpoint
ALTER TABLE `__new_accessCode` RENAME TO `accessCode`;--> statement-breakpoint
CREATE UNIQUE INDEX `accessCode_code_unique` ON `accessCode` (`code`);--> statement-breakpoint
CREATE INDEX `idx_accessCode_usedBy` ON `accessCode` (`usedBy`);--> statement-breakpoint
CREATE INDEX `idx_message_createdAt` ON `message` (`createdAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_scenarioAgent_scenario_persona` ON `scenarioAgent` (`scenarioId`,`personaId`);