// models/Product.js
const mongoose = require("mongoose");

// 📏 Size Schema
const SizeSchema = new mongoose.Schema({
  label: { type: String, required: true }, // e.g. "S", "M", "1-2Y"
  stock: { type: Number, default: 0 },
  max: { type: Number, default: null }, // ✅ optional per-size max quantity per order
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
    price: { type: Number, required: true },
    mrp: { type: Number }, // optional
    category: { type: String },

    // legacy fields kept for backwards compatibility
    sizes: [{ type: String }], // legacy list of size labels
    stock: { type: Number, default: 0 }, // fallback total stock for non-variant items
    imageUrl: { type: String }, // fallback thumbnail
    colors: [ColorSchema],

    // ✅ NEW FIELD — controls how many can be added to cart per order
    maxOrder: { type: Number, default: 10 },

    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", ProductSchema);
