// backend/utils/mailer.js
const nodemailer = require("nodemailer");

let transporter = null;
let usingEthereal = false;

async function initTransporter() {
  if (transporter) return transporter;

  const smtpHost = process.env.SMTP_HOST;
  const forceEthereal = process.env.SMTP_USE_ETHEREAL === "true";

  // Use Ethereal for development when SMTP not configured or when forced
  if (!smtpHost || forceEthereal || (process.env.NODE_ENV === "development" && !smtpHost)) {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    usingEthereal = true;
    console.log("🧪 Mailer: using Ethereal test account (dev). Preview messages in console.");
  } else {
    transporter = nodemailer.createTransport({
      host: smtpHost,
      port: parseInt(process.env.SMTP_PORT || "587"),
      secure: (process.env.SMTP_SECURE === "true") || false,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
    });
    usingEthereal = false;
  }

  return transporter;
}

async function sendMail(options) {
  const t = await initTransporter();
  const mailOptions = {
    from: process.env.MAIL_FROM || process.env.SMTP_USER || "no-reply@kokoru.com",
    to: options.to,
    subject: options.subject,
    text: options.text || undefined,
    html: options.html || undefined,
  };

  try {
    const info = await t.sendMail(mailOptions);
    if (usingEthereal) {
      const preview = nodemailer.getTestMessageUrl(info);
      if (preview) console.log("🧪 Ethereal preview URL:", preview);
    }
    return info;
  } catch (err) {
    console.error("❌ sendMail failed:", err && err.message ? err.message : err);
    throw err;
  }
}

module.exports = { sendMail };
