const express = require("express");
const router = express.Router();
const {
  getAddresses,
  addAddress,
  deleteAddress,
  updateAddress,
  validateAddress,
  normalizeAddresses,
  authMiddleware,
} = require("../controllers/userController");
const User = require("../models/User");
const adminAuth = require("../middleware/adminAuth");

/* =========================================================
   🏠 Address Management (existing)
========================================================= */
router.get("/addresses", authMiddleware, getAddresses);
router.post("/addresses", authMiddleware, addAddress);
router.delete("/addresses/:id", authMiddleware, deleteAddress);
router.patch("/addresses/:id", authMiddleware, updateAddress);
router.post("/addresses/validate", authMiddleware, validateAddress);
router.post("/addresses/normalize", authMiddleware, normalizeAddresses);
// Set an existing address as the default for the user
router.post("/addresses/:id/set-default", authMiddleware, async (req, res) => {
  // delegate to controller method for consistency
  try {
    const { id } = req.params;
    const controller = require('../controllers/userController');
    return controller.setDefaultAddress(req, res);
  } catch (err) {
    console.error('❌ set-default route error:', err);
    return res.status(500).json({ message: 'Failed to set default address' });
  }
});

/* =========================================================
   👤 USER PROFILE & ACCOUNT ROUTES (NEW)
========================================================= */

/**
 * @route GET /api/users/me
 * @desc  Get logged-in user's profile details
 * @access Private
 */
router.get("/me", authMiddleware, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });
    res.json(user);
  } catch (error) {
    console.error("❌ Error fetching user details:", error);
    res.status(500).json({ message: "Error fetching user details" });
  }
});

/**
 * @route PATCH /api/users/profile
 * @desc  Update basic user profile fields
 * @access Private
 */
router.patch("/profile", authMiddleware, async (req, res) => {
  try {
    const { name, mobile, defaultAddress } = req.body;

    const user = await User.findById(req.user.id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (name) user.name = name;
    if (mobile) user.mobile = mobile;
    if (defaultAddress) user.defaultAddress = defaultAddress;

    await user.save();

    const safeUser = user.toObject();
    delete safeUser.password;

    res.json({
      message: "Profile updated successfully",
      user: safeUser,
    });
  } catch (error) {
    console.error("❌ Error updating profile:", error);
    res.status(500).json({ message: "Error updating profile" });
  }
});

/* =========================================================
   🛡️ ADMIN USER MANAGEMENT ROUTES
========================================================= */

/**
 * @route GET /api/users/admin/all
 * @desc  Get all users (admin only)
 * @access Admin
 */
router.get("/admin/all", adminAuth, async (req, res) => {
  try {
    const { q } = req.query;
    let filter = {};

    // Search filter
    if (q) {
      filter = {
        $or: [
          { name: { $regex: q, $options: "i" } },
          { email: { $regex: q, $options: "i" } },
        ],
      };
    }

    const users = await User.find(filter)
      .select("-password")
      .sort({ createdAt: -1 });

    res.json(users);
  } catch (error) {
    console.error("❌ Error fetching users (admin):", error);
    res.status(500).json({ message: "Error fetching users" });
  }
});

/**
 * @route DELETE /api/users/admin/:id
 * @desc  Delete a user (admin only)
 * @access Admin
 */
router.delete("/admin/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    await User.findByIdAndDelete(id);
    
    res.json({ 
      success: true, 
      message: `User ${user.name || user.email} deleted successfully` 
    });
  } catch (error) {
    console.error("❌ Error deleting user (admin):", error);
    res.status(500).json({ message: "Error deleting user" });
  }
});

module.exports = router;
