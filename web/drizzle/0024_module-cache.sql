CREATE TABLE `module_cache` (
	`source_sha` text NOT NULL,
	`builder_rev` text NOT NULL,
	`status` text NOT NULL,
	`slug` text,
	`namespace` text,
	`name` text,
	`pfm` blob,
	`sidecar` text,
	`bytes` integer,
	`error` text,
	`created_at` integer NOT NULL,
	`used_at` integer NOT NULL,
	PRIMARY KEY(`source_sha`, `builder_rev`)
);
--> statement-breakpoint
CREATE INDEX `module_cache_used_at_idx` ON `module_cache` (`used_at`);--> statement-breakpoint
CREATE TABLE `build_meta` (
	`key` text PRIMARY KEY NOT NULL,
	`value` text NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
ALTER TABLE `builds` ADD `kind` text DEFAULT 'send' NOT NULL;--> statement-breakpoint
ALTER TABLE `builds` ADD `source_sha` text;--> statement-breakpoint
CREATE INDEX `builds_source_sha_idx` ON `builds` (`source_sha`);
