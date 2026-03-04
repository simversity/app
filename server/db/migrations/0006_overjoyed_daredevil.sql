CREATE TABLE `dailyBudget` (
	`userId` text NOT NULL,
	`date` text NOT NULL,
	`count` integer DEFAULT 0 NOT NULL,
	PRIMARY KEY(`userId`, `date`)
);
--> statement-breakpoint
CREATE INDEX `idx_dailyBudget_date` ON `dailyBudget` (`date`);--> statement-breakpoint
ALTER TABLE `scenario` DROP COLUMN `studentName`;--> statement-breakpoint
ALTER TABLE `scenario` DROP COLUMN `studentGrade`;--> statement-breakpoint
ALTER TABLE `scenario` DROP COLUMN `misconception`;--> statement-breakpoint
ALTER TABLE `scenario` DROP COLUMN `systemPrompt`;--> statement-breakpoint
ALTER TABLE `scenario` DROP COLUMN `openingMessage`;