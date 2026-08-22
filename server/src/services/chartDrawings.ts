import { and, asc, eq } from "drizzle-orm";
import { db } from "../db";
import { chartDrawings, type ChartDrawing } from "../db/schema";

export type DrawingType = "trendline" | "ray" | "horizontal";

export interface CreateDrawingInput {
  symbol: string;
  type: DrawingType;
  p1Date: string;
  p1Price: number;
  p2Date?: string | null;
  p2Price?: number | null;
}

export async function listDrawings(userId: string, symbol: string): Promise<ChartDrawing[]> {
  return db
    .select()
    .from(chartDrawings)
    .where(and(eq(chartDrawings.userId, userId), eq(chartDrawings.symbol, symbol.toUpperCase())))
    .orderBy(asc(chartDrawings.createdAt));
}

export async function createDrawing(userId: string, input: CreateDrawingInput): Promise<ChartDrawing> {
  const [drawing] = await db
    .insert(chartDrawings)
    .values({
      userId,
      symbol: input.symbol.toUpperCase(),
      type: input.type,
      p1Date: input.p1Date,
      p1Price: input.p1Price,
      p2Date: input.p2Date ?? null,
      p2Price: input.p2Price ?? null,
    })
    .returning();
  return drawing;
}

export interface UpdateDrawingInput {
  p1Date?: string;
  p1Price?: number;
  p2Date?: string | null;
  p2Price?: number | null;
}

export async function updateDrawing(userId: string, id: string, input: UpdateDrawingInput): Promise<ChartDrawing | null> {
  const updates: Partial<typeof chartDrawings.$inferInsert> = {};
  if (input.p1Date !== undefined) updates.p1Date = input.p1Date;
  if (input.p1Price !== undefined) updates.p1Price = input.p1Price;
  if (input.p2Date !== undefined) updates.p2Date = input.p2Date;
  if (input.p2Price !== undefined) updates.p2Price = input.p2Price;

  const [updated] = await db
    .update(chartDrawings)
    .set(updates)
    .where(and(eq(chartDrawings.id, id), eq(chartDrawings.userId, userId)))
    .returning();
  return updated ?? null;
}

export async function deleteDrawing(userId: string, id: string): Promise<boolean> {
  const deleted = await db
    .delete(chartDrawings)
    .where(and(eq(chartDrawings.id, id), eq(chartDrawings.userId, userId)))
    .returning({ id: chartDrawings.id });
  return deleted.length > 0;
}
