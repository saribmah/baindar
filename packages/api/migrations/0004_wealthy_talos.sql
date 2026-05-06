CREATE TABLE `conversation` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`primary_doc_id` text,
	`created_at` integer NOT NULL,
	`last_activity_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`primary_doc_id`) REFERENCES `document`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `conversation_user_id_last_activity_idx` ON `conversation` (`user_id`,`last_activity_at`);--> statement-breakpoint
CREATE INDEX `conversation_primary_doc_id_idx` ON `conversation` (`primary_doc_id`);