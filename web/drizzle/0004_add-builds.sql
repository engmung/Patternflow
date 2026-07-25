CREATE TABLE `builds` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`patterns` text NOT NULL,
	`namespaces` text,
	`artifact` text,
	`artifact_bytes` integer,
	`error` text,
	`worker` text,
	`created_at` integer NOT NULL,
	`started_at` integer,
	`finished_at` integer,
	FOREIGN KEY (`user_id`) REFERENCES `user`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `builds_status_created_idx` ON `builds` (`status`,`created_at`);--> statement-breakpoint
CREATE INDEX `builds_user_id_idx` ON `builds` (`user_id`);