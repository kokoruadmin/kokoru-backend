const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema({
  name: { type: String, default: '' },
  label: { type: String, default: 'Other' },
  address: { type: String, default: '' },
  pincode: { type: String, default: '' },
  mobile: { type: String, default: '' },
  alternateMobile: { type: String, default: '' },
  landmark: { type: String, default: '' },
  email: { type: String, default: '' },
  place: { type: String, default: '' },
  district: { type: String, default: '' },
  state: { type: String, default: '' },
});

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  mobile: String,
  defaultAddress: String,
  // store addresses as subdocuments so each gets an _id
  addresses: [addressSchema],
  isAdmin: { type: Boolean, default: false }, // 🟣 new
  
  // Password reset fields
  passwordResetToken: String,
  passwordResetExpires: Date,
}, {
  timestamps: true // adds createdAt and updatedAt
});


module.exports = mongoose.model("User", userSchema);
