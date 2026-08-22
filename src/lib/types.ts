// Type-only re-export from the server's Drizzle schema — erased at build time,
// so no server runtime code (express, pg, bcrypt) ever enters the client bundle.
// Always import from here with `import type`, never a value import.
export type { User, UserStock, StockCache, UserTrade, StockAlert, ChartDrawing } from "../../server/src/db/schema";
export type { WatchlistListWithSymbols } from "../../server/src/services/watchlistLists";
export type { DrawingType } from "../../server/src/services/chartDrawings";
