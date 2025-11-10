const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true },
    discountType: { type: String, enum: ["flat", "percent"], required: true },
    discountValue: { type: Number, required: true },
    maxDiscount: { type: Number, default: 0 },
    minOrder: { type: Number, default: 0 },
    expiryDate: { type: Date, required: true },
    description: { type: String },
    isActive: { type: Boolean, default: true },
    firstOrderOnly: { type: Boolean, default: false },
    giftToUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  },
  { timestamps: true }
);

// ✅ Proper export — this creates & registers the model
module.exports = mongoose.model("Coupon", couponSchema);
