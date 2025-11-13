const express = require("express");
const {
  createOffer,
  getAllOffers,
  getActiveOffers,
  getApplicableOffers,
  updateOffer,
  deleteOffer,
  getOfferAnalytics,
  toggleOfferStatus
} = require("../controllers/offerController");
const adminAuth = require("../middleware/adminAuth");
const userAuth = require("../middleware/userAuth");

const router = express.Router();

// Public routes
router.get("/", getActiveOffers); // Get active offers for storefront
router.post("/applicable", getApplicableOffers); // Get offers applicable to cart

// Admin routes
router.post("/admin", adminAuth, createOffer); // Create new offer
router.get("/admin", adminAuth, getAllOffers); // Get all offers with filters
router.put("/admin/:id", adminAuth, updateOffer); // Update offer
router.delete("/admin/:id", adminAuth, deleteOffer); // Delete offer
router.patch("/admin/:id/toggle", adminAuth, toggleOfferStatus); // Toggle active status
router.get("/admin/:id/analytics", adminAuth, getOfferAnalytics); // Get offer analytics

module.exports = router;