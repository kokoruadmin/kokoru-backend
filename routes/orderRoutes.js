// backend/routes/orderRoutes.js
const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const { sendMail } = require("../utils/mailer"); // ✅ NEW import

/* =========================================================
   🟣 GET all orders (supports ?q=search, ?from, ?to)
========================================================= */
router.get("/", async (req, res) => {
  try {
    const { from, to, q } = req.query;
    const filter = {};

    if (q) {
      filter.$or = [
        { "address.address": { $regex: q, $options: "i" } },
        { customerName: { $regex: q, $options: "i" } },
        { userEmail: { $regex: q, $options: "i" } },
      ];
    }

    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to) filter.createdAt.$lte = new Date(to);
    }

    const orders = await Order.find(filter).sort({ createdAt: -1 });
    res.json(orders);
  } catch (err) {
    console.error("❌ Error fetching orders:", err);
    res.status(500).json({ message: "Error fetching orders" });
  }
});

/* =========================================================
   🟢 GET single order
========================================================= */
router.get("/:id", async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    res.json(order);
  } catch (err) {
    console.error(err);
    res.status(500).json({ message: "Error fetching order" });
  }
});

/* =========================================================
   ➕ POST create new order (used by admin)
========================================================= */
router.post("/", async (req, res) => {
  try {
    const newOrder = new Order(req.body);
    const saved = await newOrder.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error("❌ Error creating order:", err);
    res.status(500).json({ message: "Error creating order" });
  }
});

/* =========================================================
   🧪 POST create dummy order (for testing)
========================================================= */
router.post("/dummy", async (req, res) => {
  try {
    const dummy = new Order({
      userEmail: "testuser@example.com",
      customerName: "Test User",
      contact: "9999999999",
      address: { label: "Home", address: "Sainik School Chandrapur" },
      items: [
        {
          name: "Lavender Kurti",
          price: 1200,
          quantity: 1,
          colorName: "Lavender",
          sizeLabel: "M",
        },
      ],
      amount: 1200,
      paymentId: "TESTPAY123",
      status: "paid",
    });
    const saved = await dummy.save();
    res.json(saved);
  } catch (err) {
    console.error("❌ Dummy order creation failed:", err);
    res.status(500).json({ message: "Error creating dummy order" });
  }
});

/* =========================================================
   ✏️ PATCH update order status (admin use)
========================================================= */
router.patch("/:id/status", async (req, res) => {
  try {
    const { status } = req.body;
    if (!status)
      return res.status(400).json({ message: "Status field is required" });

    const order = await Order.findById(req.params.id);
    if (!order)
      return res.status(404).json({ message: "Order not found" });

    const oldStatus = order.status;
    order.status = status;
    await order.save();

    console.log(`📦 Order ${order._id} status changed: ${oldStatus} → ${status}`);

    /* =========================================================
       📧 Send Notification Emails (Admin + Customer)
    ========================================================== */
    try {
      const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL;
      const adminUrl =
        (process.env.APP_ADMIN_URL || "http://localhost:3000") +
        `/admin/orders/${order._id}`;

      // 🔔 Notify Admin
      if (adminEmail) {
        await sendMail({
          to: adminEmail,
          subject: `Order ${order._id} status updated to ${status}`,
          html: `
            <h3>📦 Order Status Updated</h3>
            <p><strong>Order ID:</strong> ${order._id}</p>
            <p><strong>Previous:</strong> ${oldStatus}</p>
            <p><strong>New Status:</strong> ${status}</p>
            <p><a href="${adminUrl}" target="_blank">🔗 View Order in Admin Dashboard</a></p>
          `,
        });
        console.log(`📧 Admin notified about status update for ${order._id}`);
      }

      // 📬 Notify Customer (if email available)
      if (order.userEmail) {
        await sendMail({
          to: order.userEmail,
          subject: `Your Order ${order._id} is now ${status}`,
          html: `
            <p>Dear ${order.customerName || "Customer"},</p>
            <p>Your order <strong>${order._id}</strong> status has been updated to <strong>${status}</strong>.</p>
            <p>Thank you for shopping with <strong>Kokoru</strong> 🌸</p>
          `,
        }).catch((err) =>
          console.error("⚠️ Failed to notify customer:", err.message)
        );
      }
    } catch (mailErr) {
      console.error("❌ Failed to send notification emails:", mailErr);
    }

    res.json({
      success: true,
      message: `Order ${order._id} status updated to ${status}`,
      order,
    });
  } catch (err) {
    console.error("❌ Error updating order status:", err);
    res.status(500).json({ message: "Error updating order status" });
  }
});

module.exports = router;
