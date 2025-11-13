const Coupon = require("../models/coupon");
const Order = require("../models/Order"); // For first-order validation

// Utility — secure random coupon generator
const generateSecureCode = (prefix = "KOKO") => {
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${random}`;
};

// ➕ Create coupon (admin)
const createCoupon = async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.code) body.code = generateSecureCode();
    const coupon = new Coupon(body);
    await coupon.save();
    res.status(201).json(coupon);
  } catch (err) {
    console.error("Create coupon error:", err);
    res.status(400).json({ message: err.message });
  }
};

// Admin: list all coupons
const getAllCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err) {
    console.error("Get all coupons error:", err);
    res.status(500).json({ message: err.message });
  }
};

// Public: list active coupons for storefront/carousel
const getActiveCoupons = async (req, res) => {
  try {
    const today = new Date();
    const coupons = await Coupon.find({ isActive: true, expiryDate: { $gte: today } }).sort({ createdAt: -1 });
    // return minimal fields useful to frontend
    const out = coupons.map((c) => ({
      _id: c._id,
      code: c.code,
      title: c.title,
      description: c.description,
      discountType: c.discountType,
      discountValue: c.discountValue,
      maxDiscount: c.maxDiscount,
      showInCarousel: c.showInCarousel,
      imageUrl: c.imageUrl,
    }));
    res.json(out);
  } catch (err) {
    console.error("Fetch active coupons error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ✏️ Update coupon
const updateCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    res.json(coupon);
  } catch (err) {
    console.error("Update coupon error:", err);
    res.status(400).json({ message: err.message });
  }
};

// ❌ Delete coupon
const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    res.json({ message: "Coupon deleted" });
  } catch (err) {
    console.error("Delete coupon error:", err);
    res.status(500).json({ message: err.message });
  }
};

// ✅ Validate coupon (user apply)
const validateCoupon = async (req, res) => {
  try {
    const user = req.user; // via JWT middleware
    const { code, cartTotal = 0, cartItems = [] } = req.body || {};

    if (!code) return res.status(400).json({ message: "Coupon code required" });

    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
    if (!coupon) return res.status(404).json({ message: "Invalid or inactive coupon" });
    if (coupon.expiryDate && coupon.expiryDate < new Date()) return res.status(400).json({ message: "Coupon expired" });

    // Gift check
    if (coupon.giftToUser && (!user || coupon.giftToUser.toString() !== user._id.toString())) {
      return res.status(403).json({ message: "Not eligible for this coupon" });
    }

    // First-order only
    if (coupon.firstOrderOnly && user) {
      const orders = await Order.find({ user: user._id });
      if (orders.length > 0) return res.status(400).json({ message: "Valid only for first order" });
    }

    // Usage limits
    if (coupon.usageLimit > 0 && coupon.usedBy && coupon.usedBy.length >= coupon.usageLimit)
      return res.status(400).json({ message: "Coupon usage limit reached" });

    if (user) {
      const alreadyUsed = (coupon.usedBy || []).find((u) => u.userId && u.userId.toString() === user._id.toString());
      if (alreadyUsed) return res.status(400).json({ message: "You already used this coupon" });
    }

    // Min order
    if (cartTotal < (coupon.minOrder || 0)) return res.status(400).json({ message: `Minimum order ₹${coupon.minOrder} required` });

    // Product/category restrictions
    if ((coupon.productIds || []).length) {
      const ok = cartItems.some((i) => coupon.productIds.map(String).includes(String(i.productId)));
      if (!ok) return res.status(400).json({ message: "Coupon not applicable for products" });
    }
    if ((coupon.categoryIds || []).length) {
      const ok = cartItems.some((i) => coupon.categoryIds.map(String).includes(String(i.categoryId)));
      if (!ok) return res.status(400).json({ message: "Coupon not applicable for category" });
    }

    // Discount calculation
    let discountAmount = 0;
    if (coupon.discountType === "flat") {
      discountAmount = coupon.discountValue;
    } else if (coupon.discountType === "percent") {
      discountAmount = (cartTotal * coupon.discountValue) / 100;
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount) discountAmount = coupon.maxDiscount;
    }

    if (discountAmount <= 0) return res.status(400).json({ message: "Invalid discount calculation" });

    res.json({
      valid: true,
      discountAmount,
      coupon: {
        code: coupon.code,
        discountType: coupon.discountType,
        discountValue: coupon.discountValue,
        description: coupon.description,
      },
    });
  } catch (err) {
    console.error("Validate coupon error:", err);
    res.status(500).json({ message: err.message });
  }
};

module.exports = {
  createCoupon,
  getAllCoupons,
  getActiveCoupons,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
  generateSecureCode,
};
