const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

// ✅ Use separate secrets if available, else fall back
const JWT_SECRET = process.env.JWT_SECRET || "kokoru_secret";
const ADMIN_JWT_SECRET = process.env.ADMIN_JWT_SECRET || JWT_SECRET;

/* =========================================================
   🟣 REGISTER USER
========================================================= */
exports.register = async (req, res) => {
  try {
  const { name, email, password, mobile, defaultAddress, address } = req.body;

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
      // Keep backward-compatible human-readable defaultAddress string
      defaultAddress: typeof defaultAddress === 'string' ? defaultAddress : (address && address.address) || "",
      role: "user",
    });

    // If frontend provided a structured address object, store it in addresses array
    if (address && typeof address === 'object') {
      newUser.addresses = newUser.addresses || [];
      newUser.addresses.push({
        label: address.label || 'Home',
        address: address.address || '',
        pincode: address.pincode || '',
        place: address.place || '',
        district: address.district || '',
        state: address.state || '',
        mobile: address.mobile || mobile || '',
      });
    }

    await newUser.save();

    // 🪄 Generate JWT token — includes name + id
    const token = jwt.sign(
      { id: newUser._id, email: newUser.email, name: newUser.name, role: newUser.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

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

    // 🪄 Generate JWT token
    const token = jwt.sign(
      { id: user._id, email: user.email, name: user.name, role: user.role },
      JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Login successful",
      token,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        mobile: user.mobile,
        role: user.role,
      },
    });
  } catch (err) {
    console.error("❌ Login error:", err);
    res.status(500).json({ message: "Server error during login" });
  }
};

/* =========================================================
   🧱 ADMIN LOGIN (separate admin panel)
========================================================= */
exports.adminLogin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await User.findOne({ email });
    if (!admin || admin.role !== "admin") {
      return res.status(403).json({ message: "Access denied — not an admin" });
    }

    const match = await bcrypt.compare(password, admin.password);
    if (!match) return res.status(401).json({ message: "Invalid password" });

    const token = jwt.sign(
      { id: admin._id, email: admin.email, name: admin.name, role: "admin" },
      ADMIN_JWT_SECRET,
      { expiresIn: "7d" }
    );

    res.json({
      message: "Admin login successful",
      token,
      admin: {
        _id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
      },
    });
  } catch (err) {
    console.error("❌ Admin login error:", err);
    res.status(500).json({ message: "Server error during admin login" });
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
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (err) {
    console.error("❌ Invalid token:", err.message);
    return res.status(401).json({ message: "Unauthorized: Invalid or expired token" });
  }
};

/* =========================================================
   🧱 ADMIN-ONLY MIDDLEWARE
========================================================= */
exports.adminMiddleware = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: No token provided" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const decoded = jwt.verify(token, ADMIN_JWT_SECRET);
    if (decoded.role !== "admin") {
      return res.status(403).json({ message: "Forbidden: Admin access only" });
    }
    req.admin = decoded;
    next();
  } catch (err) {
    console.error("❌ Invalid admin token:", err.message);
    return res.status(403).json({ message: "Forbidden: Invalid admin token" });
  }
};
