CREATE TABLE `source_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`sync_run_id` integer NOT NULL,
	`source_name` text NOT NULL,
	`plate` text NOT NULL,
	`payload` text NOT NULL,
	`received_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `sync_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`started_at` text NOT NULL,
	`completed_at` text NOT NULL,
	`raw_count` integer NOT NULL,
	`unique_count` integer NOT NULL,
	`conflict_count` integer NOT NULL,
	`status` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `vehicles` (
	`plate` text PRIMARY KEY NOT NULL,
	`plate_group` text NOT NULL,
	`vehicle_type` text NOT NULL,
	`owner` text NOT NULL,
	`route` text NOT NULL,
	`district` text NOT NULL,
	`status` text NOT NULL,
	`inspection` text NOT NULL,
	`permit` text NOT NULL,
	`driver` text NOT NULL,
	`phone` text NOT NULL,
	`brand` text NOT NULL,
	`model` text NOT NULL,
	`year` integer NOT NULL,
	`sources` text NOT NULL,
	`has_conflict` integer DEFAULT false NOT NULL,
	`updated_at` text NOT NULL
);
