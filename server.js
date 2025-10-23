// backend/server.js
const express = require("express");
const dotenv = require("dotenv");
const connectDB = require("./config/db");
const os = require("os");


dotenv.config();
connectDB();

const app = express();

const cors = require("cors");

const allowedOrigins = [
  "http://localhost:3000",                        // for local dev
  "https://kokoru-frontend.vercel.app",           // your Vercel production frontend
  "https://kokoru-frontend-pk3vybdkw-kokoru.vercel.app" // preview link
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (like mobile apps or curl)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    } else {
      console.log("❌ Blocked by CORS:", origin);
      return callback(new Error("Not allowed by CORS"));
    }
  },
  credentials: true,
}));


// ✅ Auto-detect LAN IP dynamically
function getLocalIP() {
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === "IPv4" && !net.internal) {
        return net.address;
      }
    }
  }
  return "127.0.0.1";
}

const localIP = getLocalIP();
console.log(`🌐 Detected local IP: ${localIP}`);


app.use(express.json());

// ✅ Routes
const productRoutes = require("./routes/productRoutes");
const orderRoutes = require("./routes/orderRoutes");
const paymentRoutes = require("./routes/paymentRoutes");
const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const imageProxyRoutes = require("./routes/imageProxy");

app.use("/api/products", productRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/payment", paymentRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/users", userRoutes);
app.use("/api/image", imageProxyRoutes);
app.use("/api/users", require("./routes/userRoutes"));

// ✅ Root test
app.get("/", (req, res) => {
  res.send("🌸 Kokoru backend is running perfectly!");
});

// ✅ Global Error handler
app.use((err, req, res, next) => {
  console.error("❌ Server Error:", err.stack);
  res.status(500).json({ message: "Internal server error" });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () =>
  console.log(`🚀 Server running on http://${localIP}:${PORT}`)
);
