const express = require("express");
const router = express.Router();
const {
  createReview,
  getReviewsForProduct,
  getReviewStats,
  getAllReviews,
  deleteReview,
} = require("../controllers/reviewController");
const { authMiddleware, adminMiddleware } = require("../controllers/authController");

// 🟢 Create Review (authenticated)
router.post("/:productId", authMiddleware, createReview);

// 🟣 Get Reviews for Product (public)
router.get("/product/:productId", getReviewsForProduct);

// 🟡 Get Review Stats (public)
router.get("/stats/:productId", getReviewStats);

// 🟣 Admin-only routes
router.get("/", authMiddleware, adminMiddleware, getAllReviews);
router.delete("/:id", authMiddleware, adminMiddleware, deleteReview);

module.exports = router;
