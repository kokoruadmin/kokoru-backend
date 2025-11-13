const mongoose = require("mongoose");

const offerSchema = new mongoose.Schema(
  {
    // Basic info
    name: { type: String, required: true },
    details: { type: String, required: true },
    
    // Targeting
    categoryIds: [{ 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "Category", 
      required: true 
    }],
    
    // Discount configuration
    discountPercentage: { 
      type: Number, 
      required: true, 
      min: 0, 
      max: 100 
    },
    maxDiscountAmount: { 
      type: Number, 
      required: true, 
      min: 0 
    },
    minCartValue: { 
      type: Number, 
      default: 0, 
      min: 0 
    },
    
    // Timing
    startDate: { 
      type: Date, 
      default: Date.now 
    },
    endDate: { 
      type: Date, 
      required: true 
    },
    
    // Visibility and control
    isActive: { 
      type: Boolean, 
      default: true 
    },
    showInCarousel: { 
      type: Boolean, 
      default: false 
    },
    
    // Professional features
    priority: { 
      type: Number, 
      default: 1, 
      min: 1, 
      max: 10 
    }, // Higher priority offers apply first
    
    // Usage tracking
    appliedCount: { 
      type: Number, 
      default: 0 
    },
    totalSavings: { 
      type: Number, 
      default: 0 
    },
    
    // A/B Testing
    variantName: { 
      type: String, 
      default: 'default' 
    },
    
    // Advanced targeting
    targetUserSegments: [{
      type: String,
      enum: ['new_users', 'returning_users', 'premium_users', 'all']
    }],
    
    // Scheduling
    isScheduled: { 
      type: Boolean, 
      default: false 
    },
    scheduleSettings: {
      daysOfWeek: [{ 
        type: String, 
        enum: ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'] 
      }],
      timeSlots: [{
        start: String, // "09:00"
        end: String    // "18:00"
      }]
    },
    
    // Admin metadata
    createdBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User" 
    },
    lastModifiedBy: { 
      type: mongoose.Schema.Types.ObjectId, 
      ref: "User" 
    },
    
    // Image for carousel
    imageUrl: { type: String },
    
    // Terms and conditions
    terms: { type: String }
  },
  { 
    timestamps: true,
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
  }
);

// Virtual for checking if offer is currently active
offerSchema.virtual('isCurrentlyActive').get(function() {
  const now = new Date();
  return this.isActive && 
         this.startDate <= now && 
         this.endDate >= now &&
         this.isWithinSchedule();
});

// Method to check if within scheduled time
offerSchema.methods.isWithinSchedule = function() {
  if (!this.isScheduled) return true;
  
  const now = new Date();
  const currentDay = now.toLocaleDateString('en', { weekday: 'lowercase' });
  const currentTime = now.toTimeString().slice(0, 5); // "HH:MM"
  
  // Check day of week
  if (this.scheduleSettings.daysOfWeek.length > 0 && 
      !this.scheduleSettings.daysOfWeek.includes(currentDay)) {
    return false;
  }
  
  // Check time slots
  if (this.scheduleSettings.timeSlots.length > 0) {
    return this.scheduleSettings.timeSlots.some(slot => 
      currentTime >= slot.start && currentTime <= slot.end
    );
  }
  
  return true;
};

// Method to calculate discount for a given amount
offerSchema.methods.calculateDiscount = function(cartValue) {
  if (cartValue < this.minCartValue) return 0;
  
  const discountAmount = (cartValue * this.discountPercentage) / 100;
  return Math.min(discountAmount, this.maxDiscountAmount);
};

// Index for performance
offerSchema.index({ categoryIds: 1, isActive: 1, endDate: 1 });
offerSchema.index({ startDate: 1, endDate: 1 });
offerSchema.index({ priority: -1 });

module.exports = mongoose.model("Offer", offerSchema);