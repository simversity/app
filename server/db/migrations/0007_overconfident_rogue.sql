PRAGMA foreign_keys=OFF;--> statement-breakpoint
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
	FOREIGN KEY (`scenarioId`) REFERENCES `scenario`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`latestConversationId`) REFERENCES `conversation`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "check_progress_status" CHECK("__new_progress"."status" IN ('not_started', 'in_progress', 'completed'))
);
--> statement-breakpoint
INSERT INTO `__new_progress`("id", "userId", "courseId", "scenarioId", "status", "latestConversationId", "completedAt", "updatedAt") SELECT "id", "userId", "courseId", "scenarioId", "status", "latestConversationId", "completedAt", "updatedAt" FROM `progress`;--> statement-breakpoint
DROP TABLE `progress`;--> statement-breakpoint
ALTER TABLE `__new_progress` RENAME TO `progress`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_progress_userId` ON `progress` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_progress_courseId` ON `progress` (`courseId`);--> statement-breakpoint
CREATE INDEX `idx_progress_userId_courseId` ON `progress` (`userId`,`courseId`);--> statement-breakpoint
CREATE INDEX `idx_progress_scenarioId` ON `progress` (`scenarioId`);--> statement-breakpoint
CREATE UNIQUE INDEX `progress_userId_scenarioId_unique` ON `progress` (`userId`,`scenarioId`);--> statement-breakpoint
ALTER TABLE `scenarioAgent` ADD `maxResponseTokens` integer;