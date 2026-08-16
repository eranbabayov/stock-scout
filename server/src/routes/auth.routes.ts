import { Router } from "express";
import rateLimit from "express-rate-limit";
import { eq } from "drizzle-orm";
import { db } from "../db";
import { users } from "../db/schema";
import { comparePassword, hashPassword } from "../lib/password";
import { signToken } from "../lib/jwt";
import { setAuthCookie, clearAuthCookie } from "../lib/cookies";
import { requireAuth } from "../middleware/auth";
import { HttpError } from "../middleware/errorHandler";

export const authRouter = Router();

// Bounds brute-force login guessing and registration spam per IP. Scoped to
// just /register and /login — /me and /change-password already require a
// valid auth cookie, which is a much stronger gate than an IP-based limiter.
const authRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many attempts, please try again in a few minutes." },
});

function toPublicUser(user: { id: string; email: string; username: string }) {
  return { id: user.id, email: user.email, username: user.username };
}

authRouter.post("/register", authRateLimiter, async (req, res) => {
  const { email, password, username } = req.body ?? {};

  if (!email || !password || !username) {
    throw new HttpError(400, "email, password, and username are required");
  }

  // Normalize casing at the one write path so every lookup elsewhere (login,
  // Telegram linking) can do a plain indexed equality check instead of a
  // case-insensitive scan, and "User@x.com" / "user@x.com" can't register twice.
  const normalizedEmail = String(email).toLowerCase();

  const [existingEmail] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, normalizedEmail))
    .limit(1);
  if (existingEmail) {
    throw new HttpError(409, "An account with this email already exists");
  }

  const [existingUsername] = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.username, username))
    .limit(1);
  if (existingUsername) {
    throw new HttpError(409, "This username is already taken");
  }

  const passwordHash = await hashPassword(password);
  const [user] = await db.insert(users).values({ email: normalizedEmail, passwordHash, username }).returning();

  const token = signToken({ userId: user.id });
  setAuthCookie(res, token);
  res.json({ user: toPublicUser(user) });
});

authRouter.post("/login", authRateLimiter, async (req, res) => {
  const { email, password } = req.body ?? {};

  if (!email || !password) {
    throw new HttpError(400, "email and password are required");
  }

  const [user] = await db.select().from(users).where(eq(users.email, String(email).toLowerCase())).limit(1);
  if (!user || !(await comparePassword(password, user.passwordHash))) {
    throw new HttpError(401, "Invalid email or password");
  }

  const token = signToken({ userId: user.id });
  setAuthCookie(res, token);
  res.json({ user: toPublicUser(user) });
});

authRouter.post("/logout", (_req, res) => {
  clearAuthCookie(res);
  res.json({ success: true });
});

authRouter.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

authRouter.post("/change-password", requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body ?? {};

  if (!currentPassword || !newPassword) {
    throw new HttpError(400, "currentPassword and newPassword are required");
  }

  const [user] = await db.select().from(users).where(eq(users.id, req.user!.id)).limit(1);
  if (!user || !(await comparePassword(currentPassword, user.passwordHash))) {
    throw new HttpError(401, "Current password is incorrect");
  }

  const passwordHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash, updatedAt: new Date() }).where(eq(users.id, user.id));

  res.json({ success: true });
});
