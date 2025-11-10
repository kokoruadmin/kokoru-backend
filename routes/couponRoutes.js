const express = require("express");
const {
  createCoupon,
  getAllCoupons,
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

// Admin routes
router.post("/", adminAuth, createCoupon);
router.get("/", adminAuth, getAllCoupons);
router.put("/:id", adminAuth, updateCoupon);
router.delete("/:id", adminAuth, deleteCoupon);

// User validation
router.post("/validate", userAuth, couponRateLimiter, logCouponAttempt, validateCoupon);

// ✅ Public: Active Coupons (for product/cart display)
router.get("/active", async (req, res) => {
  try {
    const today = new Date();
    const coupons = await Coupon.find({
      isActive: true,
      expiryDate: { $gte: today },
    }).sort({ createdAt: -1 });

    res.json({ success: true, coupons });
  } catch (err) {
    console.error("❌ Fetch active coupons error:", err);
    res
      .status(500)
      .json({ success: false, message: "Failed to fetch coupons" });
  }
});

module.exports = router;
