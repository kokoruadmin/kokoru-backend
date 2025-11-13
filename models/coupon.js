const mongoose = require("mongoose");

const couponSchema = new mongoose.Schema(
  {
    // Basic info
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true, uppercase: true },
    details: { type: String, required: true },
    
    // Coupon type: "flat" or "upto"
    type: { 
      type: String, 
      enum: ["flat", "upto"], 
      required: true 
    },
    
    // For "flat" type coupons
    discountAmount: { 
      type: Number, 
      required: function() { return this.type === 'flat'; },
      min: 0
    },
    
    // For "upto" type coupons
    discountPercentage: { 
      type: Number, 
      required: function() { return this.type === 'upto'; },
      min: 0, 
      max: 100 
    },
    maxDiscountAmount: { 
      type: Number, 
      required: function() { return this.type === 'upto'; },
      min: 0
    },
    
    // Common fields
    minCartValue: { type: Number, default: 0, min: 0 },
    expiryDate: { type: Date, required: true },
    
    // Visibility and control
    isActive: { type: Boolean, default: true },
    showInCarousel: { type: Boolean, default: false },
    
    // User targeting
    isUserSpecific: { type: Boolean, default: false },
    targetUserId: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User",
      required: function() { return this.isUserSpecific; }
    },
    
    // Advanced targeting
    targetUserSegments: [{
      type: String,
      enum: ['new_users', 'returning_users', 'premium_users', 'first_order', 'all']
    }],
    
    // Usage limits and tracking
    usageLimit: { type: Number, default: 0 }, // 0 = unlimited
    usageCount: { type: Number, default: 0 },
    usedBy: [{
      userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      usedAt: { type: Date, default: Date.now },
      orderValue: { type: Number },
      discountApplied: { type: Number }
    }],
    
    // Professional features
    priority: { type: Number, default: 1, min: 1, max: 10 },
    
    // A/B Testing
    variantName: { type: String, default: 'default' },
    
    // Scheduling (optional)
    isScheduled: { type: Boolean, default: false },
    scheduleSettings: {
      daysOfWeek: [{ 
        type: String, 
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] 
      }],
      timeSlots: [{
        start: String,
        end: String
      }]
    },
    
    // Category/Product restrictions (optional)
    applicableCategories: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Category" 
    }],
    applicableProducts: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Product" 
    }],
    excludedCategories: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Category" 
    }],
    excludedProducts: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Product" 
    }],
    
    // Marketing features
    referralBonus: { type: Number, default: 0 }, // Extra discount for referrals
    stackableWithOffers: { type: Boolean, default: true },
    
    // Admin metadata
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    lastModifiedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    
    // Image for carousel
    imageUrl: { type: String },
    
    // Terms and conditions
    terms: { type: String },
    
    // Analytics
    totalSavings: { type: Number, default: 0 },
    clickCount: { type: Number, default: 0 },
    conversionRate: { type: Number, default: 0 }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for checking if coupon is currently valid
couponSchema.virtual('isCurrentlyValid').get(function() {
  const now = new Date();
  return this.isActive && 
         this.expiryDate >= now &&
         (this.usageLimit === 0 || this.usageCount < this.usageLimit) &&
         this.isWithinSchedule();
});

// Virtual for usage percentage
couponSchema.virtual('usagePercentage').get(function() {
  if (this.usageLimit === 0) return 0;
  return Math.round((this.usageCount / this.usageLimit) * 100);
});

// Method to check if within scheduled time
couponSchema.methods.isWithinSchedule = function() {
  if (!this.isScheduled) return true;
  
  const now = new Date();
  const currentDay = now.toLocaleDateString('en', { weekday: 'lowercase' });
  const currentTime = now.toTimeString().slice(0, 5);
  
  if (this.scheduleSettings.daysOfWeek.length > 0 && 
      !this.scheduleSettings.daysOfWeek.includes(currentDay)) {
    return false;
  }
  
  if (this.scheduleSettings.timeSlots.length > 0) {
    return this.scheduleSettings.timeSlots.some(slot => 
      currentTime >= slot.start && currentTime <= slot.end
    );
  }
  
  return true;
};

// Method to calculate discount
couponSchema.methods.calculateDiscount = function(cartValue) {
  if (cartValue < this.minCartValue) return 0;
  
  if (this.type === 'flat') {
    return this.discountAmount;
  } else if (this.type === 'upto') {
    const discountAmount = (cartValue * this.discountPercentage) / 100;
    return Math.min(discountAmount, this.maxDiscountAmount);
  }
  
  return 0;
};

// Method to check if user can use this coupon
couponSchema.methods.canUserUseCoupon = function(userId) {
  if (this.isUserSpecific && !this.targetUserId.equals(userId)) {
    return false;
  }
  
  const userUsage = this.usedBy.find(usage => usage.userId.equals(userId));
  return !userUsage; // User hasn't used this coupon before
};

// Indexes for performance
couponSchema.index({ code: 1, isActive: 1 });
couponSchema.index({ expiryDate: 1, isActive: 1 });
couponSchema.index({ targetUserId: 1 });
couponSchema.index({ type: 1, isActive: 1 });

module.exports = mongoose.model("Coupon", couponSchema);
