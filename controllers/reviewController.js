const mongoose = require("mongoose");
const Review = require("../models/Review");
const Product = require("../models/product");

// POST /api/reviews/:productId
exports.createReview = async (req, res) => {
  try {
    const productId = req.params.productId;
    const { rating, comment } = req.body;

    if (!rating || rating < 1 || rating > 5)
      return res.status(400).json({ message: "Rating between 1 and 5 is required" });

    let userId = null, userName = null, userEmail = null;

    // ✅ If logged-in user
    if (req.user) {
      userId = req.user.id; // token now contains this
      userName = req.user.name || "Customer";
      userEmail = req.user.email || null;
    } 
    // ✅ If guest
    else if (req.body.userEmail) {
      userEmail = req.body.userEmail;
      userName = req.body.userName || "Guest";
    }

    const review = new Review({
      productId,
      userId,
      userName,
      userEmail,
      rating,
      comment,
    });

    await review.save();

    // Update product stats
    const stats = await Review.aggregate([
      { $match: { productId: new mongoose.Types.ObjectId(productId) } },
      { $group: { _id: "$productId", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);

    if (stats && stats[0]) {
      await Product.findByIdAndUpdate(productId, {
        avgRating: Math.round((stats[0].avg || 0) * 10) / 10,
        reviewsCount: stats[0].count || 0,
      });
    }

    res.status(201).json({ success: true, review });
  } catch (err) {
    console.error("Create review error:", err);
    res.status(500).json({ message: "Failed to create review" });
  }
};

// GET /api/reviews/product/:productId
exports.getReviewsForProduct = async (req, res) => {
  try {
    const { productId } = req.params;
    const validId = mongoose.isValidObjectId(productId);

    const reviews = await Review.find({
      productId: validId ? new mongoose.Types.ObjectId(productId) : productId,
    }).sort({ createdAt: -1 });

    const stats = await Review.aggregate([
      { $match: { productId: validId ? new mongoose.Types.ObjectId(productId) : productId } },
      { $group: { _id: "$productId", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);

    const avg = stats[0]?.avg ? Math.round(stats[0].avg * 10) / 10 : 0;
    const count = stats[0]?.count || reviews.length;

    res.json({ reviews, avg, count });
  } catch (err) {
    console.error("Get reviews error:", err);
    res.status(500).json({ message: "Failed to fetch reviews" });
  }
};

// GET /api/reviews/stats/:productId
exports.getReviewStats = async (req, res) => {
  try {
    const { productId } = req.params;
    const validId = mongoose.isValidObjectId(productId);

    const stats = await Review.aggregate([
      { $match: { productId: validId ? new mongoose.Types.ObjectId(productId) : productId } },
      { $group: { _id: "$productId", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);

    const avg = stats[0]?.avg ? Math.round(stats[0].avg * 10) / 10 : 0;
    const count = stats[0]?.count || 0;

    res.json({ avg, count });
  } catch (err) {
    console.error("Review stats error:", err);
    res.status(500).json({ message: "Failed to fetch review stats" });
  }
};
/* =========================================================
   🟣 ADMIN: GET ALL REVIEWS
   (optional query ?productId=xyz)
========================================================= */
exports.getAllReviews = async (req, res) => {
  console.log("📥 Admin requested all reviews");

  try {
    const reviews = await Review.find({})
      .populate("productId", "name category")
      .sort({ createdAt: -1 });

    console.log("✅ Reviews fetched:", reviews.length);

    res.status(200).json({
      success: true,
      count: reviews.length,
      reviews,
    });
  } catch (err) {
    console.error("❌ Get all reviews error:", err);
    res.status(500).json({
      success: false,
      message: "Failed to fetch all reviews",
    });
  }
};
/* =========================================================
   🔴 ADMIN: DELETE A REVIEW
========================================================= */
exports.deleteReview = async (req, res) => {
  try {
    const { id } = req.params;

    const review = await Review.findByIdAndDelete(id);
    if (!review) {
      return res.status(404).json({ message: "Review not found" });
    }

    // Update product stats after deletion
    const stats = await Review.aggregate([
      { $match: { productId: new mongoose.Types.ObjectId(review.productId) } },
      { $group: { _id: "$productId", avg: { $avg: "$rating" }, count: { $sum: 1 } } },
    ]);

    if (stats && stats[0]) {
      await Product.findByIdAndUpdate(review.productId, {
        avgRating: Math.round((stats[0].avg || 0) * 10) / 10,
        reviewsCount: stats[0].count || 0,
      });
    } else {
      await Product.findByIdAndUpdate(review.productId, {
        avgRating: 0,
        reviewsCount: 0,
      });
    }

    res.json({ success: true, message: "Review deleted successfully" });
  } catch (err) {
    console.error("Admin delete review error:", err);
    res.status(500).json({ message: "Failed to delete review" });
  }
};
