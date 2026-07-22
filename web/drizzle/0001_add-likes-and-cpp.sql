CREATE TABLE `likes` (
	`user_id` text NOT NULL,
	`pattern_id` text NOT NULL,
	`created_at` integer NOT NULL,
	PRIMARY KEY(`user_id`, `pattern_id`),
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`pattern_id`) REFERENCES `patterns`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `likes_pattern_id_idx` ON `likes` (`pattern_id`);--> statement-breakpoint
ALTER TABLE `patterns` ADD `code_cpp` text;