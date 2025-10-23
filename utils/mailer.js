// backend/utils/mailer.js
const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "587"),
  secure: (process.env.SMTP_SECURE === "true") || false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

async function sendMail(options) {
  const mailOptions = {
    from: process.env.MAIL_FROM || process.env.SMTP_USER,
    to: options.to,
    subject: options.subject,
    text: options.text || undefined,
    html: options.html || undefined,
  };
  return transporter.sendMail(mailOptions);
}

module.exports = { sendMail };
