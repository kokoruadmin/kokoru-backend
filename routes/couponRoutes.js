const express = require("express");
const {
  createCoupon,
  getAllCoupons,
  getActiveCoupons,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
} = require("../controllers/couponController");
const { couponRateLimiter } = require("../middleware/rateLimit");
const { logCouponAttempt } = require("../middleware/couponLogger");
const userAuth = require("../middleware/userAuth");
const adminAuth = require("../middleware/adminAuth");

// ✅ add this line
const Coupon = require("../models/coupon");

const router = express.Router();

// Public: GET / => active coupons for storefront/carousel
router.get("/", getActiveCoupons);

// Admin routes
router.post("/", adminAuth, createCoupon);
router.get("/all", adminAuth, getAllCoupons);
router.put("/:id", adminAuth, updateCoupon);
router.delete("/:id", adminAuth, deleteCoupon);

// User validation
router.post("/validate", userAuth, couponRateLimiter, logCouponAttempt, validateCoupon);

module.exports = router;
