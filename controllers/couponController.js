import Coupon from "../models/coupon.js";
import Order from "../models/Order.js"; // For first-order validation

// Utility — secure random coupon generator
export const generateSecureCode = (prefix = "KOKO") => {
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}-${random}`;
};

// ➕ Create coupon
export const createCoupon = async (req, res) => {
  try {
    const body = req.body;
    if (!body.code) body.code = generateSecureCode();
    const coupon = new Coupon(body);
    await coupon.save();
    res.status(201).json(coupon);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// 📜 List coupons (admin)
export const getAllCoupons = async (req, res) => {
  try {
    const coupons = await Coupon.find().sort({ createdAt: -1 });
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✏️ Update coupon
export const updateCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndUpdate(req.params.id, req.body, { new: true });
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    res.json(coupon);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
};

// ❌ Delete coupon
export const deleteCoupon = async (req, res) => {
  try {
    const coupon = await Coupon.findByIdAndDelete(req.params.id);
    if (!coupon) return res.status(404).json({ message: "Coupon not found" });
    res.json({ message: "Coupon deleted" });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// ✅ Validate coupon (user apply)
export const validateCoupon = async (req, res) => {
  try {
    const user = req.user; // via JWT middleware
    const { code, cartTotal, cartItems } = req.body;

    const coupon = await Coupon.findOne({ code: code.toUpperCase(), isActive: true });
    if (!coupon) return res.status(404).json({ message: "Invalid or inactive coupon" });
    if (coupon.expiryDate < new Date()) return res.status(400).json({ message: "Coupon expired" });

    // Gift check
    if (coupon.giftToUser && coupon.giftToUser.toString() !== user._id.toString()) {
      return res.status(403).json({ message: "Not eligible for this coupon" });
    }

    // First-order only
    if (coupon.firstOrderOnly) {
      const orders = await Order.find({ user: user._id });
      if (orders.length > 0)
        return res.status(400).json({ message: "Valid only for first order" });
    }

    // Usage limits
    if (coupon.usageLimit > 0 && coupon.usedBy.length >= coupon.usageLimit)
      return res.status(400).json({ message: "Coupon usage limit reached" });

    const alreadyUsed = coupon.usedBy.find(
      (u) => u.userId.toString() === user._id.toString()
    );
    if (alreadyUsed) return res.status(400).json({ message: "You already used this coupon" });

    // Min order
    if (cartTotal < coupon.minOrder)
      return res.status(400).json({ message: `Minimum order ₹${coupon.minOrder} required` });

    // Product/category restrictions
    if (coupon.productIds?.length) {
      const ok = cartItems.some((i) => coupon.productIds.includes(i.productId));
      if (!ok) return res.status(400).json({ message: "Coupon not applicable for products" });
    }
    if (coupon.categoryIds?.length) {
      const ok = cartItems.some((i) => coupon.categoryIds.includes(i.categoryId));
      if (!ok) return res.status(400).json({ message: "Coupon not applicable for category" });
    }

    // Discount calculation
    let discountAmount = 0;
    if (coupon.discountType === "flat") {
      discountAmount = coupon.discountValue;
    } else if (coupon.discountType === "percent") {
      discountAmount = (cartTotal * coupon.discountValue) / 100;
      if (coupon.maxDiscount && discountAmount > coupon.maxDiscount)
        discountAmount = coupon.maxDiscount;
    }

    if (discountAmount <= 0)
      return res.status(400).json({ message: "Invalid discount calculation" });

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
    res.status(500).json({ message: err.message });
  }
};
