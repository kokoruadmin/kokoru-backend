// backend/routes/pincodeProxy.js
const express = require("express");
const router = express.Router();

router.get("/:pin", async (req, res) => {
  try {
    const pin = String(req.params.pin || "").trim();
    if (!/^\d{6}$/.test(pin)) return res.status(400).json({ ok: false, message: "Invalid pincode" });

    // call official API
    const apiRes = await fetch(`https://api.postalpincode.in/pincode/${pin}`);
    const json = await apiRes.json();

    if (!Array.isArray(json) || !json[0]) {
      return res.status(502).json({ ok: false, message: "Postal API failure" });
    }

    const root = json[0];
    if (root.Status !== "Success") {
      return res.status(404).json({ ok: false, message: "Pincode not found", details: root });
    }

    const postOffices = root.PostOffice || [];
    const places = postOffices.map((p) => ({
      name: p.Name,
      branchType: p.BranchType,
      deliveryStatus: p.DeliveryStatus,
      district: p.District,
      state: p.State,
    }));

    res.json({
      ok: true,
      pin,
      places,
      district: postOffices[0]?.District || "",
      state: postOffices[0]?.State || "",
    });
  } catch (err) {
    console.error("Pincode proxy error:", err);
    res.status(500).json({ ok: false, message: "Server error" });
  }
});

module.exports = router;
