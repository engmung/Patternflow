import { defineConfig } from "drizzle-kit";

export default defineConfig({
  dialect: "sqlite",
  schema: "./src/lib/community/schema.ts",
  out: "./drizzle",
  dbCredentials: {
    url: process.env.COMMUNITY_DB_PATH ?? "./data/community.db",
  },
});
