import dotenv from "dotenv";

dotenv.config({ path: "server/.env" });

// Dynamic import so dotenv finishes populating process.env before any
// module (e.g. lib/jwt.ts, db/index.ts) reads it at module-load time.
const { createApp } = await import("./app");

const port = Number(process.env.PORT ?? 4000);
const app = createApp();

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
});
