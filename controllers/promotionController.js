const Coupon = require("../models/coupon");
const Offer = require("../models/Offer");

// Get both coupons and offers for carousel display
const getCombinedOffersAndCoupons = async (req, res) => {
  try {
    const now = new Date();
    
    // Get active coupons
    const activeCoupons = await Coupon.find({
      isActive: true,
      expiryDate: { $gte: now },
      showInCarousel: true,
      isUserSpecific: false
    })
    .sort({ priority: -1, createdAt: -1 })
    .limit(10);

    // Get active offers
    const activeOffers = await Offer.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      showInCarousel: true
    })
    .populate('categoryIds', 'name')
    .sort({ priority: -1, createdAt: -1 })
    .limit(10);

    // Filter by schedule
    const validCoupons = activeCoupons.filter(coupon => coupon.isWithinSchedule());
    const validOffers = activeOffers.filter(offer => offer.isWithinSchedule());

    // Format coupons for frontend
    const formattedCoupons = validCoupons.map(coupon => ({
      id: `c-${coupon._id}`,
      _id: coupon._id,
      type: 'coupon',
      code: coupon.code,
      title: coupon.name || coupon.code,
      text: coupon.details || (
        coupon.type === 'flat' 
          ? `Flat ₹${coupon.discountAmount} off` 
          : `${coupon.discountPercentage}% off upto ₹${coupon.maxDiscountAmount}`
      ),
      href: '/shop',
      image: coupon.imageUrl,
      showInCarousel: true,
      discountType: coupon.type,
      discountValue: coupon.type === 'flat' ? coupon.discountAmount : coupon.discountPercentage,
      maxDiscountAmount: coupon.maxDiscountAmount,
      minCartValue: coupon.minCartValue,
      priority: coupon.priority
    }));

    // Format offers for frontend
    const formattedOffers = validOffers.map(offer => ({
      id: `o-${offer._id}`,
      _id: offer._id,
      type: 'offer',
      code: null,
      title: offer.name,
      text: offer.details || `${offer.discountPercentage}% off upto ₹${offer.maxDiscountAmount}`,
      href: '/shop',
      image: offer.imageUrl,
      showInCarousel: true,
      discountType: 'percent',
      discountValue: offer.discountPercentage,
      maxDiscountAmount: offer.maxDiscountAmount,
      minCartValue: offer.minCartValue,
      categories: offer.categoryIds.map(cat => cat.name),
      priority: offer.priority
    }));

    // Combine and sort by priority
    const combined = [...formattedCoupons, ...formattedOffers]
      .sort((a, b) => b.priority - a.priority)
      .slice(0, 15); // Limit total items

    res.json({
      success: true,
      items: combined,
      coupons: formattedCoupons,
      offers: formattedOffers
    });

  } catch (err) {
    console.error("Get combined offers and coupons error:", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

// Get promotional banners (high priority items for main banner)
const getPromotionalBanners = async (req, res) => {
  try {
    const now = new Date();
    
    // Get high priority coupons and offers
    const highPriorityCoupons = await Coupon.find({
      isActive: true,
      expiryDate: { $gte: now },
      showInCarousel: true,
      priority: { $gte: 7 }, // High priority items
      isUserSpecific: false
    })
    .sort({ priority: -1, createdAt: -1 })
    .limit(5);

    const highPriorityOffers = await Offer.find({
      isActive: true,
      startDate: { $lte: now },
      endDate: { $gte: now },
      showInCarousel: true,
      priority: { $gte: 7 }
    })
    .populate('categoryIds', 'name')
    .sort({ priority: -1, createdAt: -1 })
    .limit(5);

    // Filter by schedule and format
    const banners = [];
    
    highPriorityCoupons.forEach(coupon => {
      if (coupon.isWithinSchedule()) {
        banners.push({
          id: `c-${coupon._id}`,
          type: 'coupon',
          code: coupon.code,
          title: coupon.name || 'Special Coupon',
          subtitle: coupon.details,
          discountText: coupon.type === 'flat' 
            ? `₹${coupon.discountAmount} OFF`
            : `${coupon.discountPercentage}% OFF`,
          image: coupon.imageUrl,
          priority: coupon.priority,
          href: '/shop'
        });
      }
    });

    highPriorityOffers.forEach(offer => {
      if (offer.isWithinSchedule()) {
        banners.push({
          id: `o-${offer._id}`,
          type: 'offer',
          code: null,
          title: offer.name || 'Special Offer',
          subtitle: offer.details,
          discountText: `${offer.discountPercentage}% OFF`,
          image: offer.imageUrl,
          priority: offer.priority,
          categories: offer.categoryIds.map(cat => cat.name),
          href: '/shop'
        });
      }
    });

    // Sort by priority
    banners.sort((a, b) => b.priority - a.priority);

    res.json({
      success: true,
      banners: banners.slice(0, 10)
    });

  } catch (err) {
    console.error("Get promotional banners error:", err);
    res.status(500).json({
      success: false,
      message: err.message
    });
  }
};

module.exports = {
  getCombinedOffersAndCoupons,
  getPromotionalBanners
};