const express = require("express");
const router = express.Router();

// GET /api/pincode/estimate?pin=XXXXX
router.get("/estimate", async (req, res) => {
  try {
    const { pin } = req.query;
    if (!pin || !/^\d{6}$/.test(pin)) return res.status(400).json({ message: "Invalid pincode" });

    // TODO: integrate Shiprocket API here to get real ETA and charges.
    // For now return a mock ETA: 3-5 days from today.
    const days = 3 + Math.floor(Math.random() * 3); // 3-5 days
    const etaDate = new Date();
    etaDate.setDate(etaDate.getDate() + days);
    const opt = { weekday: "short", day: "numeric", month: "short" };
    const text = `by ${etaDate.toLocaleDateString("en-IN", opt)}`;
    res.json({ eta: etaDate.toISOString(), text, days });
  } catch (err) {
    console.error("ETA error:", err);
    res.status(500).json({ message: "Failed to estimate delivery" });
  }
});

module.exports = router;
