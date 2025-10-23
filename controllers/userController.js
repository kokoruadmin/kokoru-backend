const User = require("../models/User");
const jwt = require("jsonwebtoken");

const JWT_SECRET = process.env.JWT_SECRET || "kokoru_secret";

// Middleware: verify JWT
// Middleware: verify JWT and attach full user
exports.authMiddleware = async (req, res, next) => {
  const token = req.headers.authorization?.split(" ")[1];
  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);

    // ✅ Fetch full user from DB
    const user = await User.findById(decoded.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    // Attach to request
    req.userId = decoded.id; // backward-compatibility
    req.user = user;         // new version (full user object)

    next();
  } catch (err) {
    console.error("Auth Middleware Error:", err);
    res.status(401).json({ message: "Invalid or expired token" });
  }
};


// 🟣 Get all saved addresses for user
// controllers/userController.js
// ✅ Middleware already exists in your setup: authMiddleware

exports.getAddresses = async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("defaultAddress addresses name email mobile");
    if (!user) return res.status(404).json({ message: "User not found" });

    // Combine default address with saved addresses
    const allAddresses = [];

    if (user.defaultAddress) {
      allAddresses.push({
        _id: "default",
        label: "Default",
        address: user.defaultAddress,
        isDefault: true,
      });
    }

    if (user.addresses && Array.isArray(user.addresses)) {
      user.addresses.forEach((addr) => allAddresses.push(addr));
    }

    res.json(allAddresses);
  } catch (err) {
    console.error("❌ Error fetching addresses:", err);
    res.status(500).json({ message: "Failed to fetch addresses" });
  }
};



// 🟣 Add a new address
exports.addAddress = async (req, res) => {
  try {
    const { label, address } = req.body;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.addresses.push({ label, address });
    await user.save();
    res.json({ message: "Address added successfully", addresses: user.addresses });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// 🟣 Delete an address
exports.deleteAddress = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.addresses = user.addresses.filter((addr) => addr._id.toString() !== id);
    await user.save();
    res.json({ message: "Address removed", addresses: user.addresses });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};
