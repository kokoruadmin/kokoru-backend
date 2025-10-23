const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema({
  label: String,
  address: String,
});

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    mobile: { type: String },
    defaultAddress: { type: String },
    addresses: [addressSchema], // ✅ added
  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);
