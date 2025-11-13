const express = require("express");
const {
  createCoupon,
  getAllCoupons,
  getActiveCoupons,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
  applyCoupon,
  getCouponAnalytics,
  toggleCouponStatus
} = require("../controllers/couponController");
const { couponRateLimiter } = require("../middleware/rateLimit");
const { logCouponAttempt } = require("../middleware/couponLogger");
const userAuth = require("../middleware/userAuth");
const adminAuth = require("../middleware/adminAuth");

const router = express.Router();

// Public: GET / => active coupons for storefront/carousel
router.get("/", getActiveCoupons);

// User routes
router.post("/validate", userAuth, couponRateLimiter, logCouponAttempt, validateCoupon);
router.post("/apply", userAuth, applyCoupon); // Mark coupon as used

// Admin routes
router.post("/admin", adminAuth, createCoupon); // Create new coupon
router.get("/admin", adminAuth, getAllCoupons); // Get all coupons with filters
router.put("/admin/:id", adminAuth, updateCoupon); // Update coupon
router.delete("/admin/:id", adminAuth, deleteCoupon); // Delete coupon
router.patch("/admin/:id/toggle", adminAuth, toggleCouponStatus); // Toggle active status
router.get("/admin/:id/analytics", adminAuth, getCouponAnalytics); // Get coupon analytics

module.exports = router;
