import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core";

export const vehicles = sqliteTable("vehicles", {
  plate: text("plate").primaryKey(),
  plateGroup: text("plate_group").notNull(),
  vehicleType: text("vehicle_type").notNull(),
  owner: text("owner").notNull(),
  route: text("route").notNull(),
  district: text("district").notNull(),
  status: text("status").notNull(),
  inspection: text("inspection").notNull(),
  permit: text("permit").notNull(),
  suspensionStart: text("suspension_start"),
  suspensionEnd: text("suspension_end"),
  driver: text("driver").notNull(),
  phone: text("phone").notNull(),
  brand: text("brand").notNull(),
  model: text("model").notNull(),
  year: integer("year").notNull(),
  sources: text("sources").notNull(),
  hasConflict: integer("has_conflict", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull(),
});

export const sourceRecords = sqliteTable("source_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  syncRunId: integer("sync_run_id").notNull(),
  sourceName: text("source_name").notNull(),
  plate: text("plate").notNull(),
  payload: text("payload").notNull(),
  receivedAt: text("received_at").notNull(),
});

export const syncRuns = sqliteTable("sync_runs", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  startedAt: text("started_at").notNull(),
  completedAt: text("completed_at").notNull(),
  rawCount: integer("raw_count").notNull(),
  uniqueCount: integer("unique_count").notNull(),
  conflictCount: integer("conflict_count").notNull(),
  status: text("status").notNull(),
});

export const dataImports = sqliteTable("data_imports", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  source: text("source").notNull(),
  fileName: text("file_name").notNull(),
  importedAt: text("imported_at").notNull(),
  rowCount: integer("row_count").notNull(),
  columnsJson: text("columns_json").notNull(),
});

export const importedRecords = sqliteTable("imported_records", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  importId: integer("import_id")
    .notNull()
    .references(() => dataImports.id, { onDelete: "cascade" }),
  source: text("source").notNull(),
  plate: text("plate"),
  ownerName: text("owner_name"),
  status: text("status"),
  rawJson: text("raw_json").notNull(),
});
