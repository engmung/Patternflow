CREATE TABLE `pattern_headers` (
	`id` text PRIMARY KEY NOT NULL,
	`pattern_id` text NOT NULL,
	`user_id` text NOT NULL,
	`code_cpp` text NOT NULL,
	`note` text,
	`stale` integer DEFAULT false NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`pattern_id`) REFERENCES `patterns`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `pattern_headers_pattern_created_idx` ON `pattern_headers` (`pattern_id`,`created_at`);--> statement-breakpoint
ALTER TABLE `patterns` ADD `pinned_header_id` text;