import fs from "fs";
import path from "path";

const logDir = path.join(process.cwd(), "logs");
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);

export const logCouponAttempt = (req, res, next) => {
  res.on("finish", () => {
    if (!req.originalUrl.includes("/api/coupons/validate")) return;

    const entry = {
      time: new Date().toISOString(),
      ip: req.ip,
      user: req.user?._id || "guest",
      code: req.body?.code,
      status: res.statusCode,
      msg: res.locals?.logMsg || res.locals?.errorMsg || "",
    };

    const line = JSON.stringify(entry) + "\n";
    fs.appendFile(path.join(logDir, "coupon.log"), line, (err) => {
      if (err) console.error("Coupon log error:", err);
    });
  });

  next();
};
