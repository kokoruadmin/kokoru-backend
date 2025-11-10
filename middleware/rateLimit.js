import rateLimit from "express-rate-limit";

// ⏱ limit apply attempts
export const couponRateLimiter = rateLimit({
  windowMs: 60 * 1000,   // 1 minute
  max: 5,                // 5 attempts per minute per IP
  message: { message: "Too many coupon attempts. Please try again later." },
  standardHeaders: true,
  legacyHeaders: false,
});
