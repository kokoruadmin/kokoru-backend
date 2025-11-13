const Offer = require("../models/Offer");

// Utility to generate unique offer codes
const generateOfferCode = (name) => {
  const cleanName = name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 6);
  const random = Math.random().toString(36).substring(2, 5).toUpperCase();
  return `${cleanName}${random}`;
};

// ➕ Create offer (admin)
const createOffer = async (req, res) => {
  try {
    const userId = req.user._id;
    const offerData = {
      ...req.body,
      createdBy: userId,
      lastModifiedBy: userId
    };

    const offer = new Offer(offerData);
    await offer.save();
    
    res.status(201).json({
      success: true,
      message: "Offer created successfully",
      offer
    });
  } catch (err) {
    console.error("Create offer error:", err);
    res.status(400).json({ 
      success: false, 
      message: err.message 
    });
  }
};

// 📜 Get all offers (admin)
const getAllOffers = async (req, res) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      status, 
      category,
      sortBy = 'createdAt',
      order = 'desc'
    } = req.query;

    const filter = {};
    
    if (status === 'active') filter.isActive = true;
    if (status === 'inactive') filter.isActive = false;
    if (status === 'expired') filter.endDate = { $lt: new Date() };
    if (category) filter.categoryIds = category;

    const offers = await Offer.find(filter)
      .populate('categoryIds', 'name')
      .populate('createdBy', 'name email')
      .sort({ [sortBy]: order === 'desc' ? -1 : 1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .exec();

    const total = await Offer.countDocuments(filter);

    res.json({
      success: true,
      offers,
      pagination: {
        current: page,
        pages: Math.ceil(total / limit),
        total
      }
    });
  } catch (err) {
    console.error("Get offers error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

// 📋 Get active offers for carousel/display
const getActiveOffers = async (req, res) => {
  try {
    const now = new Date();
    
    const offers = await Offer.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now }
    })
    .populate('categoryIds', 'name')
    .sort({ priority: -1, createdAt: -1 })
    .limit(20);

    // Filter by schedule
    const activeOffers = offers.filter(offer => offer.isWithinSchedule());

    const formattedOffers = activeOffers.map(offer => ({
      _id: offer._id,
      name: offer.name,
      details: offer.details,
      discountPercentage: offer.discountPercentage,
      maxDiscountAmount: offer.maxDiscountAmount,
      minCartValue: offer.minCartValue,
      showInCarousel: offer.showInCarousel,
      imageUrl: offer.imageUrl,
      categories: offer.categoryIds.map(cat => cat.name),
      type: 'offer'
    }));

    res.json({
      success: true,
      offers: formattedOffers
    });
  } catch (err) {
    console.error("Get active offers error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

// 🎯 Get applicable offers for cart (auto-apply logic)
const getApplicableOffers = async (req, res) => {
  try {
    const { cartItems, cartTotal } = req.body;
    
    if (!cartItems || !Array.isArray(cartItems)) {
      return res.status(400).json({
        success: false,
        message: "Cart items required"
      });
    }

    // Get categories from cart items
    const categoryIds = [...new Set(cartItems.map(item => item.categoryId))];
    
    const now = new Date();
    
    // Find offers applicable to cart categories
    const applicableOffers = await Offer.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      categoryIds: { $in: categoryIds },
      minCartValue: { $lte: cartTotal }
    })
    .populate('categoryIds', 'name')
    .sort({ priority: -1 });

    // Filter by schedule and calculate discounts
    const validOffers = [];
    
    for (const offer of applicableOffers) {
      if (offer.isWithinSchedule()) {
        const discountAmount = offer.calculateDiscount(cartTotal);
        
        validOffers.push({
          _id: offer._id,
          name: offer.name,
          details: offer.details,
          discountPercentage: offer.discountPercentage,
          maxDiscountAmount: offer.maxDiscountAmount,
          discountAmount,
          categories: offer.categoryIds.map(cat => cat.name),
          priority: offer.priority
        });
      }
    }

    // Sort by best discount amount (highest first)
    validOffers.sort((a, b) => b.discountAmount - a.discountAmount);

    res.json({
      success: true,
      offers: validOffers,
      bestOffer: validOffers[0] || null
    });
  } catch (err) {
    console.error("Get applicable offers error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

// ✏️ Update offer
const updateOffer = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;
    
    const updateData = {
      ...req.body,
      lastModifiedBy: userId
    };

    const offer = await Offer.findByIdAndUpdate(
      id, 
      updateData, 
      { new: true, runValidators: true }
    ).populate('categoryIds', 'name');

    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found"
      });
    }

    res.json({
      success: true,
      message: "Offer updated successfully",
      offer
    });
  } catch (err) {
    console.error("Update offer error:", err);
    res.status(400).json({ 
      success: false, 
      message: err.message 
    });
  }
};

// ❌ Delete offer
const deleteOffer = async (req, res) => {
  try {
    const { id } = req.params;
    
    const offer = await Offer.findByIdAndDelete(id);
    
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found"
      });
    }

    res.json({
      success: true,
      message: "Offer deleted successfully"
    });
  } catch (err) {
    console.error("Delete offer error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

// 📊 Get offer analytics
const getOfferAnalytics = async (req, res) => {
  try {
    const { id } = req.params;
    
    const offer = await Offer.findById(id);
    
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found"
      });
    }

    // Calculate analytics
    const analytics = {
      totalApplications: offer.appliedCount,
      totalSavings: offer.totalSavings,
      averageDiscount: offer.appliedCount > 0 ? offer.totalSavings / offer.appliedCount : 0,
      isCurrentlyActive: offer.isCurrentlyActive,
      daysRemaining: Math.ceil((offer.endDate - new Date()) / (1000 * 60 * 60 * 24)),
      performance: {
        conversionRate: offer.appliedCount > 0 ? (offer.appliedCount / (offer.clickCount || 1)) * 100 : 0
      }
    };

    res.json({
      success: true,
      offer,
      analytics
    });
  } catch (err) {
    console.error("Get offer analytics error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

// 🔄 Toggle offer status
const toggleOfferStatus = async (req, res) => {
  try {
    const { id } = req.params;
    
    const offer = await Offer.findById(id);
    
    if (!offer) {
      return res.status(404).json({
        success: false,
        message: "Offer not found"
      });
    }

    offer.isActive = !offer.isActive;
    offer.lastModifiedBy = req.user._id;
    await offer.save();

    res.json({
      success: true,
      message: `Offer ${offer.isActive ? 'activated' : 'deactivated'} successfully`,
      offer
    });
  } catch (err) {
    console.error("Toggle offer status error:", err);
    res.status(500).json({ 
      success: false, 
      message: err.message 
    });
  }
};

module.exports = {
  createOffer,
  getAllOffers,
  getActiveOffers,
  getApplicableOffers,
  updateOffer,
  deleteOffer,
  getOfferAnalytics,
  toggleOfferStatus,
  generateOfferCode
};