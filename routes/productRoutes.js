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
    const body = req.body || {};
    // If an authenticated user exists on the request (e.g., via auth middleware),
    // prefer that name for customerName. Many flows create orders without auth,
    // so we preserve body values when not present.
    // If you want orders to require auth, put authMiddleware here instead.
    const newOrder = new Order(body);

    // If req.user is present (authMiddleware was used upstream), prefer that name/email
    if (req.user) {
      newOrder.userEmail = req.user.email || newOrder.userEmail;
      newOrder.customerName = req.user.name || req.user.fullName || newOrder.customerName || "Customer";
      newOrder.userId = req.user._id || newOrder.userId;
    } else {
      // fallback: if body contains userEmail, use it; if body has customerName use it
      newOrder.customerName = newOrder.customerName || "Customer";
    }

    const saved = await newOrder.save();

    // send confirmation email to customer if email present
    try {
      const { sendMail } = require("../utils/mailer");
      if (saved.userEmail) {
        await sendMail({
          to: saved.userEmail,
          subject: `Order Confirmation - ${saved._id}`,
          html: `<p>Dear ${saved.customerName || "Customer"},</p>
                <p>Thank you for your order. Your order ID is <strong>${saved._id}</strong>.</p>`
        }).catch((e)=>console.error("Mail send failed:", e.message));
      }
    } catch (mailErr) {
      console.error("Mailer issue:", mailErr);
    }

    res.status(201).json(saved);
  } catch (err) {
    console.error("❌ Error creating order:", err);
    res.status(500).json({ message: "Error creating order" });
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
