const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const os = require("os");
const cors = require("cors");

dotenv.config();
connectDB();

const app = express();

/* =========================================================
   🟣 Universal CORS Handler (Local + Vercel + Admin)
========================================================= */
const allowedOrigins = [
  "http://localhost:3000",
  "https://kokoru-frontend.vercel.app",
];

// ✅ Apply CORS once; this automatically handles OPTIONS in Express v5
app.use(
  cors({
    origin(origin, callback) {
      if (!origin) return callback(null, true);
      if (origin.endsWith(".vercel.app")) return callback(null, true);
      if (allowedOrigins.includes(origin)) return callback(null, true);
      console.log("❌ Blocked by CORS:", origin);
      return callback(new Error("Not allowed by CORS"));
    },
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization"],
    credentials: true,
  })
);

app.use(express.json());

/* =========================================================
   🟢 Detect Local IP (for console display)
========================================================= */
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) return net.address;
    }
  }
  return "127.0.0.1";
}
const localIP = getLocalIP();
console.log(`🌐 Detected local IP: ${localIP}`);

/* =========================================================
   🧩 Routes
========================================================= */
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const imageProxyRoutes = require("./routes/imageProxy");
const adminRoutes = require("./routes/adminRoutes");

app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/image", imageProxyRoutes);
app.use("/api/admin", adminRoutes);

/* =========================================================
   🧭 Root Endpoint
========================================================= */
app.get("/", (req, res) => {
  res.send("🌸 Kokoru backend is running perfectly!");
});

/* =========================================================
   ⚠️ 404 Fallback (Express v5-safe)
========================================================= */
app.use((req, res) => {
  res.status(404).json({ message: "Route not found" });
});

/* =========================================================
   🧯 Global Error Handler
========================================================= */
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.stack);
  res.status(500).json({ message: "Internal server error" });
});

/* =========================================================
   🚀 Start Server
========================================================= */
const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://${localIP}:${PORT}`)
);
