const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

/* =========================================================
   🟣 REGISTER USER
========================================================= */
exports.register = async (req, res) => {
  try {
    const { name, email, password, mobile, defaultAddress } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({ message: "User already exists" });
    }

    // Encrypt password
    const hashedPassword = await bcrypt.hash(password, 10);

    // Create user
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      mobile,
      defaultAddress,
    });

    await newUser.save();

    // Generate token
    const token = jwt.sign(
      { id: newUser._id, email: newUser.email },
      process.env.JWT_SECRET || "kokoru_secret",
      { expiresIn: "7d" }
    );

    // Return user details
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
    const user = await User.findOne({ email });
    if (!user) return res.status(404).json({ message: "User not found" });

    const match = await bcrypt.compare(password, user.password);
    if (!match) return res.status(401).json({ message: "Invalid password" });

    const token = jwt.sign(
      { id: user._id, email: user.email },
      process.env.JWT_SECRET || "kokoru_secret",
      { expiresIn: "7d" }
    );

    res.json({ message: "Login successful", token, user });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: err.message });
  }
};

/* =========================================================
   🔒 AUTH MIDDLEWARE
========================================================= */
exports.authMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || "kokoru_secret");
    req.user = decoded; // { id, email }
    next();
  } catch (err) {
    console.error("Invalid token:", err);
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
};
