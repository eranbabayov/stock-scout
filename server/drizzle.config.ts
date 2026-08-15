import dotenv from "dotenv";
import { defineConfig } from "drizzle-kit";

dotenv.config({ path: "server/.env" });

export default defineConfig({
  schema: "./server/src/db/schema.ts",
  out: "./server/drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});
