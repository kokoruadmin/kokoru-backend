const mongoose = require("mongoose");

const OrderItemSchema = new mongoose.Schema({
  productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product" },
  name: { type: String, required: true },
  price: { type: Number, required: true },
  quantity: { type: Number, default: 1 },
  colorName: String,
  sizeLabel: String,
});

const OrderSchema = new mongoose.Schema(
  {
    userEmail: { type: String, required: false },
    customerName: { type: String, required: false },
    contact: { type: String },
    address: {
      label: { type: String },
      address: { type: String },
      pincode: { type: String },
      place: { type: String },
      district: { type: String },
      state: { type: String },
    },

    items: [OrderItemSchema],

    // 🧮 Main totals
    amount: { type: Number, default: 0 }, // subtotal before discount
    paymentId: { type: String },
    status: { type: String, default: "paid" }, // paid / refunded / failed

    // 🏷️ Coupon integration (✅ new fields)
    coupon: {
      code: String,
      discountType: String,
      discountValue: Number,
      discountAmount: Number,
    },
    discountAmount: { type: Number, default: 0 },
    totalAfterDiscount: { type: Number },
  // Whether this order's items have been allocated (stock decremented)
  stockAllocated: { type: Boolean, default: false },


  },
  { timestamps: true }
);

// Indexes for fast lookups
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ customerName: "text", userEmail: "text", "address.address": "text" });
module.exports = mongoose.models.Order || mongoose.model("Order", OrderSchema);
