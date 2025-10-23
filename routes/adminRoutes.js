const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || "admin";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "kokoru@2025";
const ADMIN_PASSKEY = process.env.ADMIN_PASSKEY || "superkokoru";
const JWT_SECRET = process.env.JWT_SECRET || "kokoru_secret";

router.post("/login", (req, res) => {
  const { username, password, passkey } = req.body;

  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD && passkey === ADMIN_PASSKEY) {
    const token = jwt.sign({ role: "admin", username }, JWT_SECRET, { expiresIn: "7d" });
    return res.json({ message: "Login successful", token, user: { username, isAdmin: true } });
  }

  return res.status(401).json({ message: "Invalid admin credentials" });
});

module.exports = router;
