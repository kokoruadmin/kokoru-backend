const Coupon = require("../models/coupon");
const Order = require("../models/Order");

// Utility — secure random coupon generator
const generateSecureCode = (prefix = "SAVE") => {
  const random = Math.random().toString(36).substring(2, 8).toUpperCase();
  return `${prefix}${random}`;
};

// ➕ Create coupon (admin)
const createCoupon = async (req, res) => {
  try {
    const userId = req.user._id;
    const body = req.body || {};
    
    // Auto-generate code if not provided
    if (!body.code) {
      body.code = generateSecureCode(body.type?.toUpperCase() || "SAVE");
    }
    
    const couponData = {
      ...body,
      createdBy: userId,
      lastModifiedBy: userId
    };

    // Validate required fields based on type
    if (body.type === 'flat' && !body.discountAmount) {
      return res.status(400).json({
        success: false,
        message: "Discount amount is required for flat coupons"
      });
    }
    
    if (body.type === 'upto' && (!body.discountPercentage || !body.maxDiscountAmount)) {
      return res.status(400).json({
        success: false,
        message: "Discount percentage and max discount amount are required for upto coupons"
      });
    }

    const coupon = new Coupon(couponData);
    await coupon.save();
    
    res.status(201).json({
      success: true,
      message: "Coupon created successfully",
      coupon
    });
  } catch (err) {
    console.error("Create coupon error:", err);
    res.status(400).json({ 
      success: false, 
      message: err.message 
    });
  }
};

// Admin: list all coupons with filters
const getAllCoupons = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      type, 
      status, 
      search,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;

    const filter = {};
    
    if (type) filter.type = type;
    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;
    if (status === 'expired') filter.expiryDate = { $lt: new Date() };
    if (search) {
      filter.$or = [
        { name: { $regex: search, $options: 'i' } },
        { code: { $regex: search, $options: 'i' } }
      ];
    }

    const coupons = await Coupon.find(filter)
      .populate('targetUserId', 'name email')
      .populate('createdBy', 'name email')
      .sort({ [sortBy]: order === 'desc' ? -1 : 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Coupon.countDocuments(filter);

    res.json({
      success: true,
      coupons,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (err) {
    console.error("Get all coupons error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

// Public: list active coupons for storefront/carousel
const getActiveCoupons = async (req, res) => {
  try {
    const now = new Date();
    const coupons = await Coupon.find({ 
      isActive: true, 
      expiryDate: { $gte: now },
      isUserSpecific: false // Only public coupons
    })
    .sort({ priority: -1, createdAt: -1 })
    .limit(20);

    // Filter by schedule
    const activeCoupons = coupons.filter(coupon => coupon.isWithinSchedule());

    // Return minimal fields useful to frontend
    const out = activeCoupons.map((c) => ({
      _id: c._id,
      code: c.code,
      name: c.name,
      details: c.details,
      type: c.type,
      discountAmount: c.discountAmount,
      discountPercentage: c.discountPercentage,
      maxDiscountAmount: c.maxDiscountAmount,
      minCartValue: c.minCartValue,
      showInCarousel: c.showInCarousel,
      imageUrl: c.imageUrl,
      usagePercentage: c.usagePercentage,
      terms: c.terms
    }));
    
    res.json({
      success: true,
      coupons: out
    });
  } catch (err) {
    console.error("Fetch active coupons error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

// ✏️ Update coupon
const updateCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const updateData = {
      ...req.body,
      lastModifiedBy: userId
    };

    const coupon = await Coupon.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    );
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found"
      });
    }
    
    res.json({
      success: true,
      message: "Coupon updated successfully",
      coupon
    });
  } catch (err) {
    console.error("Update coupon error:", err);
    res.status(400).json({ 
      success: false, 
      message: err.message 
    });
  }
};

// ❌ Delete coupon
const deleteCoupon = async (req, res) => {
  try {
    const { id } = req.params;
    
    const coupon = await Coupon.findByIdAndDelete(id);
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found"
      });
    }
    
    res.json({
      success: true,
      message: "Coupon deleted successfully"
    });
  } catch (err) {
    console.error("Delete coupon error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

// ✅ Validate coupon (user apply)
const validateCoupon = async (req, res) => {
  try {
    const user = req.user; // via JWT middleware
    const { code, cartTotal = 0, cartItems = [] } = req.body || {};

    if (!code) {
      return res.status(400).json({
        success: false,
        message: "Coupon code required"
      });
    }

    const coupon = await Coupon.findOne({ 
      code: code.toUpperCase(), 
      isActive: true 
    }).populate('applicableCategories excludedCategories');

    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Invalid or inactive coupon"
      });
    }

    // Check expiry
    if (coupon.expiryDate && coupon.expiryDate < new Date()) {
      return res.status(400).json({
        success: false,
        message: "Coupon has expired"
      });
    }

    // Check schedule
    if (!coupon.isWithinSchedule()) {
      return res.status(400).json({
        success: false,
        message: "Coupon is not available at this time"
      });
    }

    // Check user-specific restrictions
    if (coupon.isUserSpecific && (!user || !coupon.targetUserId.equals(user._id))) {
      return res.status(403).json({
        success: false,
        message: "This coupon is not for you"
      });
    }

    // Check if user can use this coupon
    if (user && !coupon.canUserUseCoupon(user._id)) {
      return res.status(400).json({
        success: false,
        message: "You have already used this coupon"
      });
    }

    // Check usage limits
    if (coupon.usageLimit > 0 && coupon.usageCount >= coupon.usageLimit) {
      return res.status(400).json({
        success: false,
        message: "Coupon usage limit reached"
      });
    }

    // Check minimum cart value
    if (cartTotal < coupon.minCartValue) {
      return res.status(400).json({
        success: false,
        message: `Minimum cart value of ₹${coupon.minCartValue} required`
      });
    }

    // Check category restrictions
    if (coupon.applicableCategories.length > 0) {
      const cartCategoryIds = cartItems.map(item => item.categoryId);
      const hasApplicableCategory = coupon.applicableCategories.some(cat => 
        cartCategoryIds.includes(cat._id.toString())
      );
      
      if (!hasApplicableCategory) {
        return res.status(400).json({
          success: false,
          message: "Coupon not applicable for items in your cart"
        });
      }
    }

    // Check excluded categories
    if (coupon.excludedCategories.length > 0) {
      const cartCategoryIds = cartItems.map(item => item.categoryId);
      const hasExcludedCategory = coupon.excludedCategories.some(cat => 
        cartCategoryIds.includes(cat._id.toString())
      );
      
      if (hasExcludedCategory) {
        return res.status(400).json({
          success: false,
          message: "Coupon cannot be applied to some items in your cart"
        });
      }
    }

    // Calculate discount
    const discountAmount = coupon.calculateDiscount(cartTotal);

    if (discountAmount <= 0) {
      return res.status(400).json({
        success: false,
        message: "Invalid discount calculation"
      });
    }

    // Increment click count for analytics
    coupon.clickCount += 1;
    await coupon.save();

    res.json({
      success: true,
      valid: true,
      discountAmount,
      coupon: {
        _id: coupon._id,
        code: coupon.code,
        name: coupon.name,
        type: coupon.type,
        details: coupon.details
      }
    });
  } catch (err) {
    console.error("Validate coupon error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

// 🎯 Apply coupon (mark as used)
const applyCoupon = async (req, res) => {
  try {
    const user = req.user;
    const { couponId, orderValue, discountApplied } = req.body;

    const coupon = await Coupon.findById(couponId);
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found"
      });
    }

    // Add usage record
    coupon.usedBy.push({
      userId: user._id,
      orderValue,
      discountApplied
    });

    // Update counters
    coupon.usageCount += 1;
    coupon.totalSavings += discountApplied;

    // Update conversion rate
    if (coupon.clickCount > 0) {
      coupon.conversionRate = (coupon.usageCount / coupon.clickCount) * 100;
    }

    await coupon.save();

    res.json({
      success: true,
      message: "Coupon applied successfully"
    });
  } catch (err) {
    console.error("Apply coupon error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

// 📊 Get coupon analytics
const getCouponAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    
    const coupon = await Coupon.findById(id);
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found"
      });
    }

    const analytics = {
      totalUsage: coupon.usageCount,
      totalSavings: coupon.totalSavings,
      averageOrderValue: coupon.usedBy.length > 0 ? 
        coupon.usedBy.reduce((sum, usage) => sum + usage.orderValue, 0) / coupon.usedBy.length : 0,
      averageDiscount: coupon.usedBy.length > 0 ? 
        coupon.usedBy.reduce((sum, usage) => sum + usage.discountApplied, 0) / coupon.usedBy.length : 0,
      clickCount: coupon.clickCount,
      conversionRate: coupon.conversionRate,
      usagePercentage: coupon.usagePercentage,
      isCurrentlyValid: coupon.isCurrentlyValid,
      daysUntilExpiry: Math.ceil((coupon.expiryDate - new Date()) / (1000 * 60 * 60 * 24))
    };

    res.json({
      success: true,
      coupon,
      analytics
    });
  } catch (err) {
    console.error("Get coupon analytics error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

// 🔄 Toggle coupon status
const toggleCouponStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    const coupon = await Coupon.findById(id);
    
    if (!coupon) {
      return res.status(404).json({
        success: false,
        message: "Coupon not found"
      });
    }

    coupon.isActive = !coupon.isActive;
    coupon.lastModifiedBy = req.user._id;
    await coupon.save();

    res.json({
      success: true,
      message: `Coupon ${coupon.isActive ? 'activated' : 'deactivated'} successfully`,
      coupon
    });
  } catch (err) {
    console.error("Toggle coupon status error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

module.exports = {
  createCoupon,
  getAllCoupons,
  getActiveCoupons,
  updateCoupon,
  deleteCoupon,
  validateCoupon,
  applyCoupon,
  getCouponAnalytics,
  toggleCouponStatus,
  generateSecureCode,
};
