// routes/imageProxy.js
const express = require("express");
const axios = require("axios");
const router = express.Router();

// 🟣 Universal Image Proxy for Google Drive + other sources
router.get("/", async (req, res) => {
  const { url } = req.query;
  if (!url) return res.status(400).send("Missing image URL");

  try {
    console.log("🟣 Incoming image URL:", url);

    let finalUrl = url.trim();

    // ✅ Normalize & sanitize URL
    if (!/^https?:\/\//i.test(finalUrl)) {
      return res.status(400).json({ message: "Invalid image URL" });
    }

    // ✅ Handle Google Drive links
    if (finalUrl.includes("drive.google.com")) {
      const match =
        finalUrl.match(/[-\w]{25,}/) ||
        finalUrl.match(/[?&]id=([-a-zA-Z0-9_]+)/) ||
        finalUrl.match(/\/d\/([-a-zA-Z0-9_]+)/);

      if (match && match[0]) {
        const fileId = match[0].replace(/(id=|\/d\/)/, "");
        finalUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
        console.log("✅ Converted Google Drive URL →", finalUrl);
      } else {
        console.warn("⚠ No valid ID found in Drive URL:", url);
        return res.status(400).json({ message: "Invalid Google Drive URL" });
      }
    }

    // ✅ Fetch image binary via Axios
    const response = await axios.get(finalUrl, {
      responseType: "arraybuffer",
      headers: {
        "User-Agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36",
        Accept: "image/*,*/*;q=0.8",
      },
      maxRedirects: 5,
      timeout: 15000,
      maxContentLength: Infinity,
      maxBodyLength: Infinity,
      validateStatus: (status) => status >= 200 && status < 400, // follow redirects
    });

    // ✅ Forward correct headers
    const contentType = response.headers["content-type"] || "image/jpeg";
    res.setHeader("Content-Type", contentType);
    res.setHeader("Cache-Control", "public, max-age=86400, stale-while-revalidate=3600");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");

    // ✅ Send binary data
    res.send(response.data);
  } catch (error) {
    console.error("❌ Image proxy failed:", error.message);

    if (error.response) {
      console.error("Response status:", error.response.status);
      console.error("Headers:", error.response.headers);
    }

    res
      .status(error.response?.status || 500)
      .json({
        message: "Image fetch failed",
        error: error.message,
        source: url,
      });
  }
});

module.exports = router;
