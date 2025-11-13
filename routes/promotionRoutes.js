const express = require("express");
const {
  getCombinedOffersAndCoupons,
  getPromotionalBanners
} = require("../controllers/promotionController");

const router = express.Router();

// Public routes for frontend carousel and promotions
router.get("/carousel", getCombinedOffersAndCoupons); // Combined coupons and offers for carousel
router.get("/banners", getPromotionalBanners); // High priority promotional banners

module.exports = router;