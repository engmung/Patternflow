-- The board becomes the map.
--
-- DESTRUCTIVE ON PURPOSE. Every thread now lives in a territory, and the old
-- board's posts have no natural home in one — there is no "everything else"
-- zone to sweep them into. Nothing worth keeping had been written there yet
-- (confirmed before writing this), so the board is rebuilt rather than
-- backfilled. If that is ever not true again, this migration is the wrong
-- shape: add a holding territory and UPDATE into it instead.
--
-- drizzle-kit generated an `ALTER TABLE posts ADD territory_id text NOT NULL`
-- for this, which SQLite rejects outright (a NOT NULL column added by ALTER
-- needs a non-null default) and which could not carry the foreign key either.
-- Hence the hand-written rebuild below.

CREATE TABLE `territories` (
	`id` text PRIMARY KEY NOT NULL,
	`code` text NOT NULL,
	`title` text NOT NULL,
	`description` text,
	`span` integer DEFAULT 2 NOT NULL,
	`position` integer DEFAULT 0 NOT NULL,
	`x` integer DEFAULT 720 NOT NULL,
	`y` integer DEFAULT 320 NOT NULL,
	`shipping_next` integer DEFAULT false NOT NULL,
	`questions` text,
	`archived_at` integer,
	`created_at` integer NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `territories_code_unique` ON `territories` (`code`);--> statement-breakpoint
CREATE INDEX `territories_position_idx` ON `territories` (`position`);--> statement-breakpoint
CREATE TABLE `territory_pins` (
	`id` text PRIMARY KEY NOT NULL,
	`territory_id` text NOT NULL,
	`user_id` text NOT NULL,
	`note` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`territory_id`) REFERENCES `territories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `territory_pins_unique` ON `territory_pins` (`territory_id`,`user_id`);--> statement-breakpoint
CREATE INDEX `territory_pins_user_idx` ON `territory_pins` (`user_id`);--> statement-breakpoint
-- Alerts and reports that pointed at the old board would now link to nothing.
-- (Comment reports are left alone: that target type is shared with pattern
-- comments, and the read path already drops rows whose target has gone.)
DELETE FROM `notifications` WHERE `target_type` = 'post';--> statement-breakpoint
DELETE FROM `reports` WHERE `target_type` = 'post';--> statement-breakpoint
-- Children first: foreign_keys is ON for this connection.
DROP TABLE `post_comments`;--> statement-breakpoint
DROP TABLE `posts`;--> statement-breakpoint
CREATE TABLE `posts` (
	`id` text PRIMARY KEY NOT NULL,
	`territory_id` text NOT NULL,
	`user_id` text NOT NULL,
	`title` text NOT NULL,
	`body` text NOT NULL,
	`pinned_at` integer,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`territory_id`) REFERENCES `territories`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `posts_created_at_idx` ON `posts` (`created_at`);--> statement-breakpoint
CREATE INDEX `posts_user_id_idx` ON `posts` (`user_id`);--> statement-breakpoint
CREATE INDEX `posts_territory_idx` ON `posts` (`territory_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `post_comments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`user_id` text NOT NULL,
	`body` text NOT NULL,
	`created_at` integer NOT NULL,
	`edited_at` integer,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `post_comments_post_id_idx` ON `post_comments` (`post_id`);--> statement-breakpoint
CREATE TABLE `post_attachments` (
	`id` text PRIMARY KEY NOT NULL,
	`post_id` text NOT NULL,
	`comment_id` text,
	`user_id` text,
	`filename` text NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`post_id`) REFERENCES `posts`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`comment_id`) REFERENCES `post_comments`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE INDEX `post_attachments_post_idx` ON `post_attachments` (`post_id`);
