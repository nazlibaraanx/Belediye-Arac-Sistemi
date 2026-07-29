import { defineConfig } from "drizzle-kit";

export default defineConfig({
  out: "./drizzle",
  schema: "./veritabani/arac-veritabani-semasi.ts",
  dialect: "sqlite",
});
