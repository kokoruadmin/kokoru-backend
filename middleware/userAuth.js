const jwt = require("jsonwebtoken");
const JWT_SECRET = process.env.JWT_SECRET || "kokoru_secret";

module.exports = function userAuth(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Unauthorized: No token" });
  }

  try {
    const token = authHeader.split(" ")[1];
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded; // You can later extend this if needed
    next();
  } catch (err) {
    console.error("❌ Invalid user token:", err.message);
    return res.status(401).json({ message: "Unauthorized: Invalid token" });
  }
};
