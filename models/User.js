const mongoose = require("mongoose");

const addressSchema = new mongoose.Schema({
  label: String,
  address: String,
});

const userSchema = new mongoose.Schema({
  name: String,
  email: String,
  password: String,
  mobile: String,
  defaultAddress: String,
  addresses: Array,
  isAdmin: { type: Boolean, default: false }, // 🟣 new
});


module.exports = mongoose.model("User", userSchema);
