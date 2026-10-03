import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "postgresql",
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dbCredentials: process.env.DATABASE_URL?.startsWith("postgres")
    ? { url: process.env.DATABASE_URL }
    : { url: "postgres://localhost:5432/unused" },
});
