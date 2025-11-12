const express = require("express");
const router = express.Router();
const { register, login } = require("../controllers/authController");
const bcrypt = require("bcryptjs");
const crypto = require("crypto");
const User = require("../models/User");
const { sendMail } = require("../utils/mailer");

router.post("/register", register);
router.post("/login", login);

/* =========================================================
   🔑 FORGOT PASSWORD SYSTEM
========================================================= */

/**
 * @route POST /api/auth/forgot-password
 * @desc  Send password reset email with secure token
 * @access Public
 */
router.post("/forgot-password", async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Find user by email
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      // Don't reveal if user exists - security best practice
      return res.json({ 
        message: "If an account with this email exists, you will receive a password reset link shortly." 
      });
    }

    // Generate secure reset token
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

    // Set token and expiration (15 minutes)
    user.passwordResetToken = hashedToken;
    user.passwordResetExpires = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes
    await user.save();

    // Create reset URL
    const frontendUrl = process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:3000";
    const resetUrl = `${frontendUrl}/reset-password?token=${resetToken}`;

    // Send reset email
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #6b21a8; margin: 0;">🌸 Kokoru</h1>
          <h2 style="color: #333; margin: 10px 0;">Password Reset Request</h2>
        </div>
        
        <div style="background: #f9f9f9; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
          <p>Hi ${user.name || 'there'},</p>
          <p>You requested a password reset for your Kokoru account. Click the button below to reset your password:</p>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="${resetUrl}" 
               style="background: #6b21a8; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
              Reset Password
            </a>
          </div>
          
          <p style="font-size: 14px; color: #666;">
            This link will expire in 15 minutes for security reasons.
          </p>
          
          <p style="font-size: 14px; color: #666;">
            If you didn't request this reset, you can safely ignore this email.
          </p>
        </div>
        
        <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #999; text-align: center;">
          <p>If the button doesn't work, copy and paste this link into your browser:</p>
          <p style="word-break: break-all;">${resetUrl}</p>
          <p style="margin-top: 20px;">Kokoru • Elegant & Handmade with Love</p>
        </div>
      </div>
    `;

    await sendMail({
      to: user.email,
      subject: "Reset Your Kokoru Password",
      html: emailHtml,
    });

    res.json({ 
      message: "If an account with this email exists, you will receive a password reset link shortly." 
    });

  } catch (error) {
    console.error("❌ Forgot password error:", error);
    res.status(500).json({ message: "Error sending reset email" });
  }
});

/**
 * @route POST /api/auth/reset-password
 * @desc  Reset password using secure token
 * @access Public
 */
router.post("/reset-password", async (req, res) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || !newPassword) {
      return res.status(400).json({ message: "Token and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "Password must be at least 6 characters" });
    }

    // Hash the token to compare with stored version
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find user with valid token that hasn't expired
    const user = await User.findOne({
      passwordResetToken: hashedToken,
      passwordResetExpires: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({ message: "Invalid or expired reset token" });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    // Update user password and clear reset fields
    user.password = hashedPassword;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save();

    // Send confirmation email
    const confirmationHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #6b21a8; margin: 0;">🌸 Kokoru</h1>
          <h2 style="color: #333; margin: 10px 0;">Password Reset Successful</h2>
        </div>
        
        <div style="background: #f0f9ff; border-left: 4px solid #0ea5e9; padding: 20px; margin-bottom: 20px;">
          <p>Hi ${user.name || 'there'},</p>
          <p>Your password has been successfully reset. You can now log in to your account with your new password.</p>
          <p>If you didn't make this change, please contact our support team immediately.</p>
        </div>
        
        <div style="text-align: center; margin: 30px 0;">
          <a href="${process.env.APP_URL || "http://localhost:3000"}/login" 
             style="background: #6b21a8; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block;">
            Login to Your Account
          </a>
        </div>
        
        <div style="border-top: 1px solid #eee; padding-top: 20px; font-size: 12px; color: #999; text-align: center;">
          <p>Kokoru • Elegant & Handmade with Love</p>
        </div>
      </div>
    `;

    try {
      await sendMail({
        to: user.email,
        subject: "Your Kokoru Password Has Been Reset",
        html: confirmationHtml,
      });
    } catch (mailError) {
      console.error("❌ Failed to send confirmation email:", mailError);
      // Don't fail the request if email fails
    }

    res.json({ 
      message: "Password reset successful. You can now log in with your new password." 
    });

  } catch (error) {
    console.error("❌ Reset password error:", error);
    res.status(500).json({ message: "Error resetting password" });
  }
});

module.exports = router;
