CREATE TABLE `atlas_pins` (
	`pattern_id` text PRIMARY KEY NOT NULL,
	`x` integer NOT NULL,
	`y` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`pattern_id`) REFERENCES `patterns`(`id`) ON UPDATE no action ON DELETE cascade
);
