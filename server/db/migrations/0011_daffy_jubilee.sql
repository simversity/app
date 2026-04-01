CREATE TABLE `file` (
	`id` text PRIMARY KEY NOT NULL,
	`courseId` text,
	`scenarioId` text,
	`uploadedBy` text NOT NULL,
	`originalName` text NOT NULL,
	`mimeType` text NOT NULL,
	`sizeBytes` integer NOT NULL,
	`description` text,
	`nearaiFileId` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`courseId`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scenarioId`) REFERENCES `scenario`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploadedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "check_file_parent" CHECK(("file"."courseId" IS NOT NULL AND "file"."scenarioId" IS NULL) OR ("file"."courseId" IS NULL AND "file"."scenarioId" IS NOT NULL))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `file_nearaiFileId_unique` ON `file` (`nearaiFileId`);--> statement-breakpoint
CREATE INDEX `idx_file_courseId` ON `file` (`courseId`);--> statement-breakpoint
CREATE INDEX `idx_file_scenarioId` ON `file` (`scenarioId`);--> statement-breakpoint
CREATE INDEX `idx_file_uploadedBy` ON `file` (`uploadedBy`);