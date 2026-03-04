CREATE TABLE `accessCode` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`role` text DEFAULT 'teacher' NOT NULL,
	`createdBy` text NOT NULL,
	`usedBy` text,
	`usedAt` integer,
	`expiresAt` integer,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`usedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `accessCode_code_unique` ON `accessCode` (`code`);--> statement-breakpoint
CREATE TABLE `account` (
	`id` text PRIMARY KEY NOT NULL,
	`accountId` text NOT NULL,
	`providerId` text NOT NULL,
	`userId` text NOT NULL,
	`accessToken` text,
	`refreshToken` text,
	`idToken` text,
	`accessTokenExpiresAt` integer,
	`refreshTokenExpiresAt` integer,
	`scope` text,
	`password` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `conversation` (
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
	FOREIGN KEY (`scenarioId`) REFERENCES `scenario`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "check_conversation_status" CHECK("conversation"."status" IN ('active', 'completed', 'abandoned'))
);
--> statement-breakpoint
CREATE INDEX `idx_conversation_userId` ON `conversation` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_conversation_scenarioId` ON `conversation` (`scenarioId`);--> statement-breakpoint
CREATE INDEX `idx_conversation_status` ON `conversation` (`status`);--> statement-breakpoint
CREATE TABLE `course` (
	`id` text PRIMARY KEY NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`gradeLevel` text NOT NULL,
	`subject` text NOT NULL,
	`scenarioCount` integer DEFAULT 0 NOT NULL,
	`visibility` text DEFAULT 'published' NOT NULL,
	`createdBy` text,
	`updatedBy` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updatedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "check_course_visibility" CHECK("course"."visibility" IN ('private', 'shared', 'published', 'archived'))
);
--> statement-breakpoint
CREATE TABLE `message` (
	`id` text PRIMARY KEY NOT NULL,
	`conversationId` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`agentId` text,
	`createdAt` integer NOT NULL,
	`sortOrder` integer NOT NULL,
	FOREIGN KEY (`conversationId`) REFERENCES `conversation`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`agentId`) REFERENCES `persona`(`id`) ON UPDATE no action ON DELETE set null,
	CONSTRAINT "check_message_role" CHECK("message"."role" IN ('user', 'assistant'))
);
--> statement-breakpoint
CREATE INDEX `idx_message_conversationId` ON `message` (`conversationId`);--> statement-breakpoint
CREATE TABLE `observerMessage` (
	`id` text PRIMARY KEY NOT NULL,
	`conversationId` text NOT NULL,
	`role` text NOT NULL,
	`content` text NOT NULL,
	`sortOrder` integer NOT NULL,
	`createdAt` integer NOT NULL,
	FOREIGN KEY (`conversationId`) REFERENCES `conversation`(`id`) ON UPDATE no action ON DELETE cascade,
	CONSTRAINT "check_observerMessage_role" CHECK("observerMessage"."role" IN ('user', 'assistant'))
);
--> statement-breakpoint
CREATE INDEX `idx_observerMessage_conversationId` ON `observerMessage` (`conversationId`);--> statement-breakpoint
CREATE TABLE `persona` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`description` text NOT NULL,
	`systemPrompt` text NOT NULL,
	`createdBy` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE TABLE `progress` (
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
	CONSTRAINT "check_progress_status" CHECK("progress"."status" IN ('not_started', 'in_progress', 'completed'))
);
--> statement-breakpoint
CREATE INDEX `idx_progress_userId` ON `progress` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_progress_courseId` ON `progress` (`courseId`);--> statement-breakpoint
CREATE INDEX `idx_progress_scenarioId` ON `progress` (`scenarioId`);--> statement-breakpoint
CREATE UNIQUE INDEX `progress_userId_scenarioId_unique` ON `progress` (`userId`,`scenarioId`);--> statement-breakpoint
CREATE TABLE `scenario` (
	`id` text PRIMARY KEY NOT NULL,
	`courseId` text NOT NULL,
	`title` text NOT NULL,
	`description` text NOT NULL,
	`studentName` text,
	`studentGrade` text,
	`misconception` text,
	`systemPrompt` text,
	`openingMessage` text,
	`observerPrompt` text,
	`activityContext` text,
	`model` text,
	`observerModel` text,
	`createdBy` text,
	`updatedBy` text,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	FOREIGN KEY (`courseId`) REFERENCES `course`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`createdBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`updatedBy`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `idx_scenario_courseId` ON `scenario` (`courseId`);--> statement-breakpoint
CREATE TABLE `scenarioAgent` (
	`id` text PRIMARY KEY NOT NULL,
	`scenarioId` text NOT NULL,
	`personaId` text NOT NULL,
	`openingMessage` text,
	`sortOrder` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`scenarioId`) REFERENCES `scenario`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`personaId`) REFERENCES `persona`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `idx_scenarioAgent_scenarioId` ON `scenarioAgent` (`scenarioId`);--> statement-breakpoint
CREATE INDEX `idx_scenarioAgent_personaId` ON `scenarioAgent` (`personaId`);--> statement-breakpoint
CREATE TABLE `session` (
	`id` text PRIMARY KEY NOT NULL,
	`expiresAt` integer NOT NULL,
	`token` text NOT NULL,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`ipAddress` text,
	`userAgent` text,
	`userId` text NOT NULL,
	FOREIGN KEY (`userId`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_token_unique` ON `session` (`token`);--> statement-breakpoint
CREATE TABLE `user` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`email` text NOT NULL,
	`emailVerified` integer DEFAULT false NOT NULL,
	`image` text,
	`createdAt` integer NOT NULL,
	`updatedAt` integer NOT NULL,
	`gradeLevel` text,
	`subjects` text,
	`experienceYears` integer,
	`role` text DEFAULT 'teacher' NOT NULL,
	CONSTRAINT "check_user_role" CHECK("user"."role" IN ('teacher', 'admin', 'super_admin'))
);
--> statement-breakpoint
CREATE UNIQUE INDEX `user_email_unique` ON `user` (`email`);--> statement-breakpoint
CREATE TABLE `verification` (
	`id` text PRIMARY KEY NOT NULL,
	`identifier` text NOT NULL,
	`value` text NOT NULL,
	`expiresAt` integer NOT NULL,
	`createdAt` integer,
	`updatedAt` integer
);
