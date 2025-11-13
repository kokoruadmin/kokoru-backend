const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    title: { type: String },
    // whether to show this coupon in home/carousel
    showInCarousel: { type: Boolean, default: false },
    // optional image to show in carousel (URL)
    imageUrl: { type: String, default: null },
    discountType: { type: String, enum: ["flat", "percent"], required: true },
    discountValue: { type: Number, required: true },
    maxDiscount: { type: Number, default: 0 },
    minOrder: { type: Number, default: 0 },
    expiryDate: { type: Date, required: true },
    description: { type: String },
    isActive: { type: Boolean, default: true },
    firstOrderOnly: { type: Boolean, default: false },
    // if coupon is gifted to a specific user
    giftToUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    // limit total usage across all users (0 = unlimited)
    usageLimit: { type: Number, default: 0 },
    // track users who used the coupon
    usedBy: [
      {
        userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        usedAt: { type: Date, default: Date.now },
      },
    ],
    // optional restrictions
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Product" }],
    categoryIds: [{ type: mongoose.Schema.Types.ObjectId, ref: "Category" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Coupon", couponSchema);
