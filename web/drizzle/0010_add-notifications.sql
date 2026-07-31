CREATE TABLE `notifications` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`type` text NOT NULL,
	`actor_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`target_title` text NOT NULL,
	`source_id` text,
	`snippet` text,
	`read_at` integer,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`actor_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `notifications_user_created_idx` ON `notifications` (`user_id`,`created_at`);--> statement-breakpoint
CREATE INDEX `notifications_target_idx` ON `notifications` (`target_type`,`target_id`);--> statement-breakpoint
CREATE INDEX `notifications_source_idx` ON `notifications` (`source_id`);