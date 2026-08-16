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
