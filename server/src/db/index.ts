import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import * as schema from "./schema";

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: Number(process.env.DB_POOL_MAX ?? 20),
  // Fail fast instead of hanging forever if the pool is ever exhausted under load.
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});

// node-postgres emits 'error' on the pool when an idle client hits a
// connection problem (DB restart, network blip). With no listener, Node
// treats that as an uncaught exception and kills the whole process — taking
// down every user's session over one transient DB hiccup.
pool.on("error", (err) => {
  console.error("Unexpected Postgres pool error:", err);
});

export const db = drizzle(pool, { schema });
