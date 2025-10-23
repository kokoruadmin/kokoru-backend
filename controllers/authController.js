const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ✅ Define secret ONCE and use everywhere
const JWT_SECRET = process.env.JWT_SECRET || "kokoru_secret";

/* =========================================================
   🟣 REGISTER USER
========================================================= */
exports.register = async (req, res) => {
  try {
    const { name, email, password, mobile, defaultAddress } = req.body;

    // 🔎 Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // 🔒 Encrypt password
    const hashedPassword = await bcrypt.hash(password, 10);

    // 🧾 Create new user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      mobile,
      defaultAddress,
    });

    await newUser.save();

    // 🪄 Generate JWT token
    const token = jwt.sign(
      { id: newUser._id, email: newUser.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // ✅ Return user details (without password)
    res.status(201).json({
      message: "Signup successful",
      user: {
        _id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        mobile: newUser.mobile,
        defaultAddress: newUser.defaultAddress,
      },
      token,
    });
  } catch (err) {
    console.error("❌ Signup error:", err);
    res.status(500).json({ message: "Server error during signup" });
  }
};

/* =========================================================
   🟢 LOGIN USER
========================================================= */
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 🔎 Find user
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    // 🔑 Compare passwords
    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Invalid password" });

    // 🪄 Generate JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    // ✅ Return user + token
    res.json({
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        defaultAddress: user.defaultAddress,
      },
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Server error during login" });
  }
};

/* =========================================================
   🔒 AUTH MIDDLEWARE
========================================================= */
exports.authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;

  // 🚫 No token provided
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    // ✅ Verify token using same secret
    const decoded = jwt.verify(token, JWT_SECRET);

    // Attach user data to request
    req.user = decoded; // contains { id, email }
    next();
  } catch (err) {
    console.error("❌ Invalid token:", err.message);
    return res.status(401).json({ message: "Unauthorized: Invalid or expired token" });
  }
};
