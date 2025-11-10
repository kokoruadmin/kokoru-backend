// models/Product.js
const mongoose = require("mongoose");

// 📏 Size Schema
const SizeSchema = new mongoose.Schema({
  label: { type: String, required: true }, // e.g. "S", "M", "1-2Y"
  stock: { type: Number, default: 0 },
  max: { type: Number, default: null }, // optional per-size max quantity per order
});

// 🎨 Color Schema
const ColorSchema = new mongoose.Schema({
  name: { type: String, required: true },
  hex: { type: String, default: "#ffffff" },
  images: [{ type: String }], // image URLs
  sizes: [SizeSchema], // per color sizes with stock
});

// 🛍 Product Schema
const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    description: { type: String },
    price: { type: Number, required: true }, // legacy price (can be same as ourPrice)
    // Pricing fields (new)
    ourPrice: { type: Number }, // the price you display (final price after discount)
    discount: { type: Number, default: 0 }, // percent (e.g., 20)
    mrp: { type: Number }, // computed/included MRP to show strikethrough
    category: { type: String },
    // legacy fields kept for backwards compatibility
    sizes: [{ type: String }],
    stock: { type: Number, default: 0 },
    imageUrl: { type: String },
    colors: [ColorSchema],
    // flags & offers
    allowCOD: { type: Boolean, default: true },
    allowReturn: { type: Boolean, default: true },
    allowExchange: { type: Boolean, default: true },
    offers: [{ type: String }], // short text offers/coupons
    maxOrder: { type: Number, default: 10 },
    createdAt: { type: Date, default: Date.now },
    ourPrice: { type: Number }, // admin set selling price
    discount: { type: Number, default: 0 }, // in percent
    mrp: { type: Number }, // optional (calculated by admin or server)
    allowCOD: { type: Boolean, default: true },
    allowReturn: { type: Boolean, default: true },
    allowExchange: { type: Boolean, default: true },
    offerTitle: { type: String },
    offerText: { type: String },
    avgRating: { type: Number, default: 0 },
    reviewsCount: { type: Number, default: 0 },
    sold: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Pre-save: if ourPrice and discount present but mrp missing, compute mrp
ProductSchema.pre("save", function (next) {
  try {
    // If admin provided ourPrice and discount, compute mrp (rounded)
    if (this.ourPrice != null && this.discount != null) {
      const d = Number(this.discount || 0);
      const p = Number(this.ourPrice || this.price || 0);
      if (d > 0 && p > 0 && d < 100) {
        // mrp = ourPrice / (1 - discount/100)
        const computed = Math.round(p / (1 - d / 100));
        this.mrp = this.mrp || computed;
      } else if (!this.mrp && this.price) {
        this.mrp = this.price;
      }
    } else if (!this.mrp && this.price) {
      this.mrp = this.price;
    }
  } catch (err) {
    // ignore
  }
  next();
});

// Auto-calculate MRP whenever saving if only ourPrice + discount are provided
ProductSchema.pre("save", function (next) {
  if (this.ourPrice && typeof this.discount === "number" && !this.mrp) {
    const factor = 1 - this.discount / 100;
    if (factor > 0) this.mrp = Math.round(this.ourPrice / factor);
  }
  next();
});
  

module.exports = mongoose.model("Product", ProductSchema);
