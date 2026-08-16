import nodemailer from "nodemailer";

let transporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (transporter) return transporter;

  const user = process.env.GMAIL_USER;
  const pass = process.env.GMAIL_APP_PASSWORD;
  if (!user || !pass) {
    throw new Error("GMAIL_USER and GMAIL_APP_PASSWORD must be set to send email");
  }

  transporter = nodemailer.createTransport({
    service: "gmail",
    auth: { user, pass },
  });
  return transporter;
}

export async function sendOtpEmail(to: string, code: string): Promise<void> {
  await getTransporter().sendMail({
    from: process.env.GMAIL_USER,
    to,
    subject: "Your Stock Scout Telegram login code",
    text: `Your one-time code is ${code}. It expires in 10 minutes.`,
    html: `<p>Your one-time code is <strong style="font-size:1.2em">${code}</strong>.</p><p>It expires in 10 minutes.</p>`,
  });
}

export interface AlertEmailDetails {
  symbol: string;
  description: string;
  currentPrice: number;
}

export async function sendAlertEmail(to: string, details: AlertEmailDetails): Promise<void> {
  const { symbol, description, currentPrice } = details;
  await getTransporter().sendMail({
    from: process.env.GMAIL_USER,
    to,
    subject: `${symbol} alert: ${description}`,
    text: `${symbol} ${description}. Current price: $${currentPrice}.\n\nThis alert has been completed and won't fire again — create a new one from the app or the Telegram bot if you want to keep watching this level.`,
    html: `
      <div style="font-family: -apple-system, sans-serif; max-width: 480px; margin: 0 auto;">
        <h2 style="color: #16a34a; margin-bottom: 4px;">${symbol}</h2>
        <p style="font-size: 16px; margin-top: 0;">${description}</p>
        <p style="font-size: 20px; font-weight: bold;">Current price: $${currentPrice}</p>
        <p style="color: #6b7280; font-size: 13px;">
          This alert has been completed and won't fire again — create a new one from the app or the Telegram bot
          if you want to keep watching this level.
        </p>
      </div>
    `,
  });
}
