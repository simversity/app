CREATE INDEX `idx_conversation_userId_completedAt` ON `conversation` (`userId`,`completedAt`);--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_message` (
	`id` text PRIMARY KEY NOT NULL,
	`conversationId` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`agentId` text,
	`createdAt` integer NOT NULL,
	`sortOrder` integer NOT NULL,
	FOREIGN KEY (`conversationId`) REFERENCES `conversation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agentId`) REFERENCES `persona`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "check_message_role" CHECK("__new_message"."role" IN ('user', 'assistant')),
	CONSTRAINT "check_message_agentId_role" CHECK(("__new_message"."role" != 'user' OR "__new_message"."agentId" IS NULL))
);
--> statement-breakpoint
INSERT INTO `__new_message`("id", "conversationId", "role", "content", "agentId", "createdAt", "sortOrder") SELECT "id", "conversationId", "role", "content", "agentId", "createdAt", "sortOrder" FROM `message`;--> statement-breakpoint
DROP TABLE `message`;--> statement-breakpoint
ALTER TABLE `__new_message` RENAME TO `message`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE INDEX `idx_message_conversationId` ON `message` (`conversationId`);--> statement-breakpoint
CREATE INDEX `idx_message_conversationId_sortOrder` ON `message` (`conversationId`,`sortOrder`);--> statement-breakpoint
CREATE INDEX `idx_message_agentId` ON `message` (`agentId`);--> statement-breakpoint
CREATE INDEX `idx_message_createdAt` ON `message` (`createdAt`);--> statement-breakpoint
CREATE INDEX `idx_message_conversationId_createdAt` ON `message` (`conversationId`,`createdAt`);--> statement-breakpoint
CREATE UNIQUE INDEX `uq_message_conversation_sortOrder` ON `message` (`conversationId`,`sortOrder`);--> statement-breakpoint
CREATE TABLE `__new_dailyBudget` (
	`userId` text NOT NULL,
	`date` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`userId`, `date`),
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
INSERT INTO `__new_dailyBudget`("userId", "date", "count") SELECT "userId", "date", "count" FROM `dailyBudget`;--> statement-breakpoint
DROP TABLE `dailyBudget`;--> statement-breakpoint
ALTER TABLE `__new_dailyBudget` RENAME TO `dailyBudget`;--> statement-breakpoint
CREATE INDEX `idx_dailyBudget_date` ON `dailyBudget` (`date`);