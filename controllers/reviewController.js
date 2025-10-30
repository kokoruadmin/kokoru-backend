const Review = require("../models/Review");
const Product = require("../models/product");

// POST /api/reviews/:productId  (auth required)
exports.createReview = async (req, res) => {
  try {
    const productId = req.params.productId;
    const { rating, comment } = req.body;
    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating between 1 and 5 is required" });
    }
    let userId = null, userName = null, userEmail = null;
    if (req.user) {
      userId = req.user._id;
      userName = req.user.name || req.user.fullName || req.user.username || null;
      userEmail = req.user.email || null;
    } else if (req.body.userEmail) {
      userEmail = req.body.userEmail;
      userName = req.body.userName || null;
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

    // optional: update cached stats on product (not required but helpful)
    try {
      const stats = await Review.aggregate([
        { $match: { productId: review.productId } },
        { $group: { _id: "$productId", avg: { $avg: "$rating" }, count: { $sum: 1 } } }
      ]);
      if (stats && stats[0]) {
        await Product.findByIdAndUpdate(review.productId, {
          avgRating: Math.round((stats[0].avg || 0) * 10) / 10,
          reviewsCount: stats[0].count || 0
        }, { new: true }).catch(() => {});
      }
    } catch (e) {
      // ignore aggregation errors
    }

    res.status(201).json({ success: true, review });
  } catch (err) {
    console.error("Create review error:", err);
    res.status(500).json({ message: "Failed to create review" });
  }
};

// GET /api/reviews/product/:productId  (public)
exports.getReviewsForProduct = async (req, res) => {
  try {
    const productId = req.params.productId;
    const reviews = await Review.find({ productId }).sort({ createdAt: -1 }).limit(200);
    // also compute avg + count
    const stats = await Review.aggregate([
      { $match: { productId: require('mongoose').Types.ObjectId(productId) } },
      { $group: { _id: "$productId", avg: { $avg: "$rating" }, count: { $sum: 1 } } }
    ]);
    const avg = stats && stats[0] ? Math.round((stats[0].avg || 0) * 10) / 10 : 0;
    const count = stats && stats[0] ? stats[0].count : reviews.length;
    res.json({ reviews, avg, count });
  } catch (err) {
    console.error("Get reviews error:", err);
    res.status(500).json({ message: "Failed to fetch reviews" });
  }
};

// GET /api/reviews/stats/:productId  (public)
exports.getReviewStats = async (req, res) => {
  try {
    const productId = req.params.productId;
    const stats = await Review.aggregate([
      { $match: { productId: require('mongoose').Types.ObjectId(productId) } },
      { $group: { _id: "$productId", avg: { $avg: "$rating" }, count: { $sum: 1 } } }
    ]);
    const avg = stats && stats[0] ? Math.round((stats[0].avg || 0) * 10) / 10 : 0;
    const count = stats && stats[0] ? stats[0].count : 0;
    res.json({ avg, count });
  } catch (err) {
    console.error("Review stats error:", err);
    res.status(500).json({ message: "Failed to fetch review stats" });
  }
};
