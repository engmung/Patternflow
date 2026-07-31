CREATE TABLE `deck_patterns` (
	`deck_id` text NOT NULL,
	`pattern_id` text NOT NULL,
	`position` integer NOT NULL,
	`title_snapshot` text NOT NULL,
	PRIMARY KEY(`deck_id`, `pattern_id`),
	FOREIGN KEY (`deck_id`) REFERENCES `decks`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `deck_patterns_pattern_id_idx` ON `deck_patterns` (`pattern_id`);--> statement-breakpoint
CREATE TABLE `decks` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`visibility` text DEFAULT 'private' NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `decks_user_id_idx` ON `decks` (`user_id`);--> statement-breakpoint
CREATE INDEX `decks_visibility_created_idx` ON `decks` (`visibility`,`created_at`);--> statement-breakpoint
ALTER TABLE `patterns` ADD `visibility` text DEFAULT 'public' NOT NULL;--> statement-breakpoint
CREATE INDEX `patterns_visibility_created_idx` ON `patterns` (`visibility`,`created_at`);