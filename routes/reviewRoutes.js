const express = require("express");
const router = express.Router();
const reviewController = require("../controllers/reviewController");
const { authMiddleware } = require("../controllers/authController"); // your existing auth middleware

// Public: get reviews for product
router.get("/product/:productId", reviewController.getReviewsForProduct);

// Public: basic stats
router.get("/stats/:productId", reviewController.getReviewStats);

// Protected: create review (only logged in users)
router.post("/:productId", authMiddleware, reviewController.createReview);

module.exports = router;
