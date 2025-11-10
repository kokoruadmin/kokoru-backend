const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "kokoru@2025";
const ADMIN_PASSKEY = process.env.ADMIN_PASSKEY || "superkokoru";
const JWT_SECRET = process.env.JWT_SECRET || "kokoru_secret";
const adminAuth = require("../middleware/adminAuth");
const Product = require("../models/product");

router.post("/login", (req, res) => {
  const { username, password, passkey } = req.body;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD && passkey === ADMIN_PASSKEY) {
    const token = jwt.sign({ role: "admin", username }, JWT_SECRET, { expiresIn: "7d" });
    return res.json({ message: "Login successful", token, user: { username, isAdmin: true } });
  }

  return res.status(401).json({ message: "Invalid admin credentials" });
});

/**
 * @route GET /api/admin/category-stats
 * @desc  Return aggregated category statistics (total products, total stock, total sold)
 * @access Admin
 */
router.get("/category-stats", adminAuth, async (req, res) => {
  try {
    const products = await Product.find({}).lean();

    const stats = {};
    for (const p of products) {
      const cat = p.category || "Uncategorized";
      // compute available stock for product: if colors/sizes exist use sizes stock sum, otherwise use top-level stock
      let available = 0;
      if (Array.isArray(p.colors) && p.colors.length > 0) {
        for (const c of p.colors) {
          if (Array.isArray(c.sizes)) {
            for (const s of c.sizes) {
              available += Number(s.stock || 0);
            }
          }
        }
      } else {
        available = Number(p.stock || 0);
      }

      if (!stats[cat]) stats[cat] = { category: cat, totalProducts: 0, totalStock: 0, totalSold: 0 };
      stats[cat].totalProducts += 1;
      stats[cat].totalStock += available;
      stats[cat].totalSold += Number(p.sold || 0);
    }

    const out = Object.values(stats).sort((a, b) => b.totalSold - a.totalSold);
    res.json({ ok: true, stats: out });
  } catch (err) {
    console.error("❌ Failed to compute category stats:", err);
    res.status(500).json({ ok: false, message: "Failed to compute category stats" });
  }
});

module.exports = router;

