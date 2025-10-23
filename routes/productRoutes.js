// backend/routes/productRoutes.js
const express = require("express");
const router = express.Router();
const Product = require("../models/product");

/* =========================================================
   🔧 Helper: Normalize Colors + Sizes Input
   Ensures that color/image/size/stock are correctly formatted
========================================================= */
function normalizeColors(inputColors = []) {
  return inputColors.map((c) => {
    const sizes =
      (c.sizes || []).map((s) => ({
        label: s.label || String(s),
        stock: Number(s.stock || 0),
      })) || [];

    const images =
      (c.images || c.imageLinks || "")
        .toString()
        .split(/[\n,]+/)
        .map((u) => u.trim())
        .filter(Boolean);

    return {
      name: c.name || "Color",
      hex: c.hex || "#ffffff",
      images,
      sizes,
    };
  });
}

/* =========================================================
   🟢 CREATE PRODUCT
   - Supports color variants, multiple images & size-level stock
========================================================= */
router.post("/", async (req, res) => {
  try {
    console.log("🟢 Create product request:", req.body);

    const body = req.body || {};
    if (body.colors) body.colors = normalizeColors(body.colors);

    const product = new Product(body);
    const savedProduct = await product.save();

    console.log("✅ Product created:", savedProduct._id);
    res.status(201).json(savedProduct);
  } catch (error) {
    console.error("❌ Error creating product:", error);
    res.status(400).json({ message: error.message });
  }
});

/* =========================================================
   🟣 UPDATE PRODUCT
   - Updates nested color & size arrays safely
========================================================= */
router.put("/:id", async (req, res) => {
  console.log("🟣 Update request received for ID:", req.params.id);
  console.log("🟣 Request body:", JSON.stringify(req.body, null, 2));

  try {
    const body = req.body || {};
    if (body.colors) body.colors = normalizeColors(body.colors);

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      body,
      {
        new: true,
        runValidators: true,
        overwrite: false, // don’t replace entire document
      }
    );

    if (!updatedProduct) {
      console.log("❌ Product not found");
      return res.status(404).json({ message: "Product not found" });
    }

    console.log("✅ Product updated successfully:", updatedProduct._id);
    res.json(updatedProduct);
  } catch (error) {
    console.error("❌ Error updating product:", error);
    res.status(500).json({ message: error.message });
  }
});

/* =========================================================
   🟢 GET ALL PRODUCTS
========================================================= */
router.get("/", async (req, res) => {
  try {
    const products = await Product.find();
    res.json(products);
  } catch (error) {
    res.status(500).json({ message: "Error fetching products" });
  }
});

/* =========================================================
   🔍 GET SINGLE PRODUCT
========================================================= */
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product)
      return res.status(404).json({ message: "Product not found" });

    res.json(product);
  } catch (error) {
    res.status(500).json({ message: "Error fetching product" });
  }
});

/* =========================================================
   🗑 DELETE PRODUCT
========================================================= */
router.delete("/:id", async (req, res) => {
  try {
    const deleted = await Product.findByIdAndDelete(req.params.id);
    if (!deleted)
      return res.status(404).json({ message: "Product not found" });

    res.json({ message: "✅ Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting product" });
  }
});

module.exports = router;
