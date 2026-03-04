CREATE INDEX `idx_account_userId` ON `account` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_conversation_updatedAt` ON `conversation` (`updatedAt`);--> statement-breakpoint
CREATE INDEX `idx_message_agentId` ON `message` (`agentId`);--> statement-breakpoint
CREATE INDEX `idx_persona_createdBy` ON `persona` (`createdBy`);--> statement-breakpoint
CREATE INDEX `idx_scenario_createdBy` ON `scenario` (`createdBy`);--> statement-breakpoint
CREATE INDEX `idx_session_userId` ON `session` (`userId`);--> statement-breakpoint
CREATE INDEX `idx_verification_identifier` ON `verification` (`identifier`);