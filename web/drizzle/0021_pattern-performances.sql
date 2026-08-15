CREATE TABLE `pattern_performances` (
	`id` text PRIMARY KEY NOT NULL,
	`pattern_id` text NOT NULL,
	`user_id` text NOT NULL,
	`performance_json` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pattern_id`) REFERENCES `patterns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);--> statement-breakpoint
CREATE INDEX `pattern_performances_pattern_created_idx` ON `pattern_performances` (`pattern_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `patterns` ADD `pinned_performance_id` text;
