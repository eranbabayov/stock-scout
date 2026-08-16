import { randomInt } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "../db";
import { users, telegramLinks, telegramOtpCodes } from "../db/schema";
import type { TelegramLink } from "../db/schema";
import { sendOtpEmail } from "../lib/email";
import { runAgent, NEEDS_REVERIFICATION } from "./claudeAgent";

const OTP_TTL_MS = 10 * 60 * 1000;
// Any message refreshes this — it's about the chat having gone quiet, not
// specifically about writes. Only actually attempting a write while stale
// requires re-verification (see below); reads keep working either way.
const WRITE_WINDOW_MS = 10 * 60 * 1000;
// Absolute from linkedAt (not rolling), matching the web app's
// JWT_EXPIRES_IN=7d convention — after this the chat must fully re-verify
// via email + code from scratch, the same as a brand-new link.
const LINK_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function generateOtpCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

async function findLink(chatId: string) {
  const [link] = await db
    .select()
    .from(telegramLinks)
    .where(eq(telegramLinks.telegramChatId, chatId))
    .limit(1);
  return link ?? null;
}

async function findLiveOtp(chatId: string) {
  const [otp] = await db
    .select()
    .from(telegramOtpCodes)
    .where(
      and(
        eq(telegramOtpCodes.telegramChatId, chatId),
        isNull(telegramOtpCodes.consumedAt),
        gt(telegramOtpCodes.expiresAt, new Date())
      )
    )
    .orderBy(desc(telegramOtpCodes.createdAt))
    .limit(1);
  return otp ?? null;
}

export async function handleIncomingMessage(chatId: string, rawText: string): Promise<string> {
  const text = rawText.trim();

  let link: TelegramLink | null = await findLink(chatId);

  if (link && Date.now() - link.linkedAt.getTime() > LINK_TTL_MS) {
    await db.delete(telegramLinks).where(eq(telegramLinks.id, link.id));
    link = null;
  }

  if (link) {
    if (text.toLowerCase() === "logout") {
      await db.delete(telegramLinks).where(eq(telegramLinks.id, link.id));
      return "You've been logged out. Send your email any time to log back in.";
    }

    // A write was attempted while stale and is waiting on this code.
    if (link.pendingActionText) {
      const liveOtp = await findLiveOtp(chatId);
      if (liveOtp && text === liveOtp.code) {
        await db.update(telegramOtpCodes).set({ consumedAt: new Date() }).where(eq(telegramOtpCodes.id, liveOtp.id));
        const pendingText = link.pendingActionText;
        await db
          .update(telegramLinks)
          .set({ pendingActionText: null, lastActiveAt: new Date() })
          .where(eq(telegramLinks.id, link.id));
        const result = await runAgent(link.userId, pendingText, "full");
        return `Verified — done.\n${result}`;
      }
    }

    const isIdle = Date.now() - link.lastActiveAt.getTime() > WRITE_WINDOW_MS;
    const reply = await runAgent(link.userId, text, isIdle ? "readonly" : "full");

    if (reply === NEEDS_REVERIFICATION) {
      const [user] = await db.select({ email: users.email }).from(users).where(eq(users.id, link.userId)).limit(1);
      if (user) {
        const code = generateOtpCode();
        await db.insert(telegramOtpCodes).values({
          telegramChatId: chatId,
          userId: link.userId,
          code,
          expiresAt: new Date(Date.now() + OTP_TTL_MS),
        });
        await db.update(telegramLinks).set({ pendingActionText: text }).where(eq(telegramLinks.id, link.id));
        await sendOtpEmail(user.email, code);
      }
      // Deliberately don't touch lastActiveAt — write access stays locked
      // until the code above is actually confirmed.
      return (
        "For security, since it's been a bit, please confirm it's you before I make that change — " +
        "I've sent a fresh code to your email. Reply with the 6-digit code to continue."
      );
    }

    await db.update(telegramLinks).set({ lastActiveAt: new Date() }).where(eq(telegramLinks.id, link.id));
    return reply;
  }

  const liveOtp = await findLiveOtp(chatId);
  if (liveOtp) {
    if (text === liveOtp.code) {
      await db.update(telegramOtpCodes).set({ consumedAt: new Date() }).where(eq(telegramOtpCodes.id, liveOtp.id));
      await db.insert(telegramLinks).values({ telegramChatId: chatId, userId: liveOtp.userId });
      return "You're verified! You can now ask me to add stocks to your watchlist or screen it for setups. Send \"logout\" any time to unlink this chat.";
    }
    return "That code doesn't match or has expired. Reply with the 6-digit code again, or resend your email for a new one.";
  }

  if (!text.includes("@")) {
    return "Hi! To get started, reply with the email address for your Stock Scout account.";
  }

  // Emails are stored lowercased (see auth.routes.ts register/login), so a
  // plain equality check on the normalized input is both correct and can use
  // the existing unique index — no ILIKE scan needed.
  const [user] = await db.select().from(users).where(eq(users.email, text.toLowerCase())).limit(1);
  if (!user) {
    return "I couldn't find a Stock Scout account with that email. Please double-check and try again.";
  }

  const code = generateOtpCode();
  await db.insert(telegramOtpCodes).values({
    telegramChatId: chatId,
    userId: user.id,
    code,
    expiresAt: new Date(Date.now() + OTP_TTL_MS),
  });
  await sendOtpEmail(user.email, code);

  return "I've sent a login code to your email. Reply with the 6-digit code to continue (it expires in 10 minutes).";
}
