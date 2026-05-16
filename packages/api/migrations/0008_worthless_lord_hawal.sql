CREATE TABLE `user_provider_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`spec` text NOT NULL,
	`base_url` text NOT NULL,
	`model` text NOT NULL,
	`encrypted_api_key` blob NOT NULL,
	`key_last_four` text NOT NULL,
	`last_validated_at` integer,
	`last_used_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
