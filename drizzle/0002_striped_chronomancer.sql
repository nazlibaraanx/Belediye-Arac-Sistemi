CREATE TABLE `data_imports` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`file_name` text NOT NULL,
	`imported_at` text NOT NULL,
	`row_count` integer NOT NULL,
	`columns_json` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `imported_records` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`import_id` integer NOT NULL,
	`source` text NOT NULL,
	`plate` text,
	`owner_name` text,
	`status` text,
	`raw_json` text NOT NULL,
	FOREIGN KEY (`import_id`) REFERENCES `data_imports`(`id`) ON UPDATE no action ON DELETE cascade
);
