const express = require("express");
const router = express.Router();
const {
  getAddresses,
  addAddress,
  deleteAddress,
  authMiddleware,
} = require("../controllers/userController");
const User = require("../models/User");

/* =========================================================
   🏠 Address Management (existing)
========================================================= */
router.get("/addresses", authMiddleware, getAddresses);
router.post("/addresses", authMiddleware, addAddress);
router.delete("/addresses/:id", authMiddleware, deleteAddress);

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

module.exports = router;
