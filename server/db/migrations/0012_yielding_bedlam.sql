PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_file` (
	`id` text PRIMARY KEY NOT NULL,
	`courseId` text,
	`scenarioId` text,
	`uploadedBy` text NOT NULL,
	`originalName` text NOT NULL,
	`mimeType` text NOT NULL,
	`sizeBytes` integer NOT NULL,
	`description` text,
	`nearaiFileId` text,
	`dataUri` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`courseId`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`scenarioId`) REFERENCES `scenario`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`uploadedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "check_file_parent" CHECK(("courseId" IS NOT NULL AND "scenarioId" IS NULL) OR ("courseId" IS NULL AND "scenarioId" IS NOT NULL))
);
--> statement-breakpoint
INSERT INTO `__new_file`("id", "courseId", "scenarioId", "uploadedBy", "originalName", "mimeType", "sizeBytes", "description", "nearaiFileId", "dataUri", "createdAt", "updatedAt") SELECT "id", "courseId", "scenarioId", "uploadedBy", "originalName", "mimeType", "sizeBytes", "description", "nearaiFileId", "dataUri", "createdAt", "updatedAt" FROM `file`;--> statement-breakpoint
DROP TABLE `file`;--> statement-breakpoint
ALTER TABLE `__new_file` RENAME TO `file`;--> statement-breakpoint
PRAGMA foreign_keys=ON;--> statement-breakpoint
CREATE UNIQUE INDEX `file_nearaiFileId_unique` ON `file` (`nearaiFileId`);--> statement-breakpoint
CREATE INDEX `idx_file_courseId` ON `file` (`courseId`);--> statement-breakpoint
CREATE INDEX `idx_file_scenarioId` ON `file` (`scenarioId`);--> statement-breakpoint
CREATE INDEX `idx_file_uploadedBy` ON `file` (`uploadedBy`);--> statement-breakpoint
ALTER TABLE `message` ADD `toolCalls` text;--> statement-breakpoint
ALTER TABLE `observerMessage` ADD `toolCalls` text;