// backend/routes/paymentRoutes.js
const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const Product = require("../models/product");
const Order = require("../models/Order");
const { sendMail } = require("../utils/mailer"); // ✅ NEW import
const router = express.Router();

// 🔑 Razorpay Instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* =========================================================
   🟣 CREATE ORDER (Razorpay)
========================================================= */
router.post("/create-order", async (req, res) => {
  try {
    const options = {
      amount: req.body.amount * 100, // amount in paise
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    };
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (error) {
    console.error("❌ Error creating Razorpay order:", error);
    res.status(500).send("Error creating Razorpay order");
  }
});

/* =========================================================
   🟢 VERIFY PAYMENT + UPDATE STOCK + CREATE ORDER + EMAIL ADMIN
========================================================= */
router.post("/verify", async (req, res) => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    cart,
    address,
    userEmail,
    customerName,
    contact,
  } = req.body;

  try {
    // ✅ Verify Razorpay signature
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");

    if (expectedSignature !== razorpay_signature) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid payment signature" });
    }

    /* =========================================================
       🧾 Validate and Update Stock
    ========================================================== */
    for (const item of cart) {
      const { _id, colorName, sizeLabel, quantity } = item;
      const product = await Product.findById(_id);
      if (!product)
        return res
          .status(404)
          .json({ success: false, message: `Product not found (${_id})` });

      const qty = parseInt(quantity) || 1;
      const maxOrder = product.maxOrder || 10;

      if (Array.isArray(product.colors) && colorName && sizeLabel) {
        const colorVariant = product.colors.find(
          (c) => c.name.toLowerCase() === colorName.toLowerCase()
        );
        if (!colorVariant)
          return res.status(400).json({
            success: false,
            message: `Color '${colorName}' not found for ${product.name}`,
          });

        const sizeVariant = colorVariant.sizes.find(
          (s) => s.label.toLowerCase() === sizeLabel.toLowerCase()
        );
        if (!sizeVariant)
          return res.status(400).json({
            success: false,
            message: `Size '${sizeLabel}' not found for ${product.name} (${colorName})`,
          });

        if (qty > sizeVariant.stock)
          return res.status(400).json({
            success: false,
            message: `Not enough stock for ${product.name} (${colorName} - ${sizeLabel}).`,
          });

        if (qty > maxOrder)
          return res.status(400).json({
            success: false,
            message: `Max allowed per order for ${product.name} is ${maxOrder}`,
          });

        sizeVariant.stock = Math.max(sizeVariant.stock - qty, 0);
      } else {
        if (qty > product.stock)
          return res.status(400).json({
            success: false,
            message: `Not enough stock for ${product.name}.`,
          });
        if (qty > maxOrder)
          return res.status(400).json({
            success: false,
            message: `Max allowed per order for ${product.name} is ${maxOrder}`,
          });

        product.stock = Math.max(product.stock - qty, 0);
      }

      await product.save();
    }

    /* =========================================================
       🧾 Step 2: Create and Save Order in DB
    ========================================================== */
    const orderItems = cart.map((item) => ({
      productId: item._id,
      name: item.name,
      price: item.price,
      quantity: item.quantity,
      colorName: item.colorName || null,
      sizeLabel: item.sizeLabel || null,
    }));

    const totalAmount = cart.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0
    );

    const newOrder = new Order({
      userEmail: userEmail || "guest",
      customerName: customerName || address?.label || "Customer",
      contact: contact || "",
      address: {
        label: address?.label || "Home",
        address: address?.address || address,
      },
      items: orderItems,
      amount: totalAmount,
      paymentId: razorpay_payment_id,
      status: "paid",
    });

    const savedOrder = await newOrder.save();

    /* =========================================================
       📧 Step 3: Send Admin Notification Email
    ========================================================== */
    try {
      const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
      if (adminEmail) {
        const adminUrl =
          (process.env.APP_ADMIN_URL || "http://localhost:3000") +
          `/admin/orders/${savedOrder._id}`;
        const html = `
          <h3>🛍️ New Order Received</h3>
          <p><strong>Order ID:</strong> ${savedOrder._id}</p>
          <p><strong>Amount:</strong> ₹${savedOrder.amount}</p>
          <p><strong>Customer:</strong> ${savedOrder.customerName}</p>
          <p><a href="${adminUrl}" target="_blank">🔗 View Order in Admin Dashboard</a></p>
        `;
        await sendMail({
          to: adminEmail,
          subject: `New Order Received - ${savedOrder._id}`,
          html,
        });
        console.log("📧 Admin notified for new order:", savedOrder._id);
      }
    } catch (mailErr) {
      console.error("❌ Failed to send admin notification:", mailErr);
    }

    console.log("✅ Payment verified, stock updated, and order created");

    res.json({
      success: true,
      message: "Payment verified, stock updated, and order created",
      orderId: savedOrder._id,
    });
  } catch (error) {
    console.error("❌ Error verifying payment:", error);
    res.status(500).json({
      success: false,
      message: "Error verifying payment or updating stock",
    });
  }
});

module.exports = router;
