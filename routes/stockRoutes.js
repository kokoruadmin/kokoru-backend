const express = require("express");
const router = express.Router();
const Product = require("../models/product");
const { adminMiddleware } = require("../controllers/authController");

// PATCH /api/stock/update
router.patch("/update", adminMiddleware, async (req, res) => {
  try {
    const { changes } = req.body;
    if (!Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({ success: false, message: "No changes provided" });
    }

    let updatedCount = 0;

    for (const ch of changes) {
      const { productId, colorName, sizeLabel, addedStock } = ch;
      if (!productId || !colorName || !sizeLabel || !addedStock) continue;

      const product = await Product.findById(productId);
      if (!product) continue;

      const color = product.colors.find((c) => c.name === colorName);
      if (!color) continue;

      const size = color.sizes.find((s) => s.label === sizeLabel);
      if (!size) continue;

      size.stock += Number(addedStock);
      updatedCount++;

      // Optional: also recalc total stock at product level
      product.stock = product.colors.reduce(
        (sum, c) => sum + c.sizes.reduce((a, s) => a + (s.stock || 0), 0),
        0
      );

      await product.save();
    }

    res.json({ success: true, updated: updatedCount });
  } catch (err) {
    console.error("❌ Stock update failed:", err);
    res.status(500).json({ success: false, message: "Server error" });
  }
});

module.exports = router;
