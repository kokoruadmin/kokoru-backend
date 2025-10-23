// backend/models/Order.js
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
    },
    items: [OrderItemSchema],
    amount: { type: Number, default: 0 },
    paymentId: { type: String },
    status: { type: String, default: "paid" }, // paid / refunded / failed
  },
  { timestamps: true }
);

// Performance indexes
OrderSchema.index({ createdAt: -1 });
OrderSchema.index({ customerName: "text", userEmail: "text", "address.address": "text" });

module.exports = mongoose.model("Order", OrderSchema);
