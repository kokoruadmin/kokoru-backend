// backend/routes/orderRoutes.js
const express = require("express");
const router = express.Router();
const Order = require("../models/Order");
const { sendMail } = require("../utils/mailer");
const { authMiddleware } = require("../controllers/authController");
const adminAuth = require("../middleware/adminAuth"); // new middleware

/* =========================================================
   🟣 GET all orders (only logged-in user's orders)
========================================================= */
router.get("/", authMiddleware, async (req, res) => {
  try {
    const { from, to, q } = req.query;
    const user = req.user;

    if (!user?.email) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const filter = {
      userEmail: user.email,
    };

    // 🟡 optional filters
    if (q) {
      filter.$and = [
        { userEmail: user.email },
        {
          $or: [
            { "address.address": { $regex: q, $options: "i" } },
            { customerName: { $regex: q, $options: "i" } },
          ],
        },
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
   🟢 GET single order (only user's own order)
========================================================= */
router.get("/:id", authMiddleware, async (req, res) => {
  try {
    const user = req.user;
    if (!user?.email) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    if (order.userEmail !== user.email) {
      return res.status(403).json({ message: "Access denied" });
    }

    res.json(order);
  } catch (err) {
    console.error("❌ Error fetching order:", err);
    res.status(500).json({ message: "Error fetching order" });
  }
});

/* =========================================================
   🟢 GET all orders (Admin Access)
========================================================= */
router.get("/admin/all", adminAuth, async (req, res) => {
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
    console.error("❌ Error fetching all orders (admin):", err);
    res.status(500).json({ message: "Error fetching orders" });
  }
});

/* =========================================================
   ➕ POST create new order (admin or system use)
========================================================= */
router.post("/", async (req, res) => {
  try {
    const body = req.body || {};

    // If items are provided, attempt to validate and decrement stock similar to the payment flow
    const cart = Array.isArray(body.items) ? body.items : body.cart || [];

    // Validate and update stock per product
    for (const item of cart) {
      const productId = item.productId || item._id || item._id;
      const qty = Number(item.quantity || item.qty || item.quantityOrdered || 1);
      if (!productId) continue;

      const Product = require('../models/product');
      const product = await Product.findById(productId);
      if (!product) {
        return res.status(404).json({ message: `Product not found (${productId})` });
      }

      const maxOrder = product.maxOrder || 10;
      if (qty > maxOrder) return res.status(400).json({ message: `Max allowed per order for ${product.name} is ${maxOrder}` });

      // If variant info exists
      if (item.colorName || item.sizeLabel) {
        if (Array.isArray(product.colors)) {
          const colorVariant = product.colors.find(
            (c) => c.name && item.colorName && String(c.name).toLowerCase() === String(item.colorName).toLowerCase()
          );
          if (!colorVariant) return res.status(400).json({ message: `Color '${item.colorName}' not found for ${product.name}` });

          const sizeVariant = colorVariant.sizes.find(
            (s) => s.label && item.sizeLabel && String(s.label).toLowerCase() === String(item.sizeLabel).toLowerCase()
          );
          if (!sizeVariant) return res.status(400).json({ message: `Size '${item.sizeLabel}' not found for ${product.name} (${item.colorName})` });

          if (qty > sizeVariant.stock) return res.status(400).json({ message: `Not enough stock for ${product.name} (${item.colorName} - ${item.sizeLabel}).` });

          sizeVariant.stock = Math.max(Number(sizeVariant.stock || 0) - qty, 0);
          product.sold = (product.sold || 0) + qty;

          // recompute top-level stock
          try {
            let total = 0;
            if (Array.isArray(product.colors)) {
              for (const c of product.colors) {
                if (Array.isArray(c.sizes)) {
                  for (const s of c.sizes) total += Number(s.stock || 0);
                }
              }
            }
            product.stock = total;
          } catch (e) {}
        } else {
          // no color/size structure - fallback to top-level
          if (qty > product.stock) return res.status(400).json({ message: `Not enough stock for ${product.name}.` });
          product.stock = Math.max(Number(product.stock || 0) - qty, 0);
          product.sold = (product.sold || 0) + qty;
        }
      } else {
        // no variant
        if (qty > product.stock) return res.status(400).json({ message: `Not enough stock for ${product.name}.` });
        product.stock = Math.max(Number(product.stock || 0) - qty, 0);
        product.sold = (product.sold || 0) + qty;
      }

      await product.save();
    }

    // Mark order as having allocated stock if we processed a cart
    if (Array.isArray(cart) && cart.length > 0) {
      body.stockAllocated = true;
    }

    // Create order doc using provided body
    const newOrder = new Order(body);
    const saved = await newOrder.save();
    res.status(201).json(saved);
  } catch (err) {
    console.error("❌ Error creating order:", err);
    res.status(500).json({ message: "Error creating order" });
  }
});

/* =========================================================
   🧪 POST create dummy order (testing only)
   (you told me dummy button removed in UI; route remains if you want)
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
   ✏️ PATCH update order status (admin only)
========================================================= */
router.patch("/:id/status", adminAuth, async (req, res) => {
  try {
    const { status } = req.body;
    if (!status) {
      return res.status(400).json({ message: "Status field is required" });
    }

    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ message: "Order not found" });
    const oldStatus = order.status;

    const newStatus = String(status).toLowerCase();

    // If admin moves order to 'shipped', allocate stock now (decrement). Only allocate once.
    // NOTE: Allocation was previously performed on 'confirmed'. To avoid double-allocation,
    // we only allocate when order.stockAllocated is false.
    if (newStatus === 'shipped' && !order.stockAllocated) {
      try {
        for (const it of order.items || []) {
          const prodModel = require('../models/product');
          const prod = await prodModel.findById(it.productId);
          if (!prod) throw new Error(`Product not found: ${it.productId}`);

          const qty = Number(it.quantity || 0);
          if (qty <= 0) continue;

          // If variant info exists, decrement that size stock
          if (it.colorName || it.sizeLabel) {
            if (Array.isArray(prod.colors)) {
              const color = prod.colors.find(c => String(c.name).toLowerCase() === String(it.colorName || '').toLowerCase());
              if (!color) throw new Error(`Color '${it.colorName}' not found for ${prod.name}`);
              const size = (color.sizes || []).find(s => String(s.label).toLowerCase() === String(it.sizeLabel || '').toLowerCase());
              if (!size) throw new Error(`Size '${it.sizeLabel}' not found for ${prod.name} (${it.colorName})`);
              if (qty > size.stock) throw new Error(`Not enough stock for ${prod.name} (${it.colorName} - ${it.sizeLabel})`);
              size.stock = Math.max(0, Number(size.stock || 0) - qty);
            } else {
              if (qty > prod.stock) throw new Error(`Not enough stock for ${prod.name}`);
              prod.stock = Math.max(0, Number(prod.stock || 0) - qty);
            }

            // Recompute top-level stock from variants
            try {
              let total = 0;
              if (Array.isArray(prod.colors)) {
                for (const c of prod.colors) {
                  if (Array.isArray(c.sizes)) {
                    for (const s of c.sizes) total += Number(s.stock || 0);
                  }
                }
              }
              prod.stock = total;
            } catch (e) {}
          } else {
            if (qty > prod.stock) throw new Error(`Not enough stock for ${prod.name}`);
            prod.stock = Math.max(0, Number(prod.stock || 0) - qty);
          }

          // increment sold
          prod.sold = (prod.sold || 0) + qty;
          await prod.save();
        }

        order.stockAllocated = true;
      } catch (allocErr) {
        console.error('❌ Stock allocation failed during shipping:', allocErr);
        return res.status(400).json({ message: `Stock allocation failed: ${allocErr.message}` });
      }
    }

    // If moving to cancelled/refunded from a non-cancel/refund state, rollback stock
    const willRollback = ['cancelled', 'refunded', 'canceled'].includes(newStatus)
      && !['cancelled', 'refunded', 'canceled'].includes(String(oldStatus).toLowerCase());

    if (willRollback && order.stockAllocated) {
      // Restore stock for each item in the order
      try {
        for (const it of order.items || []) {
          try {
            const prodModel = require('../models/product');
            const prod = await prodModel.findById(it.productId);
            if (!prod) continue;

            const qty = Number(it.quantity || 0);
            if (qty <= 0) continue;

            // If variant info exists, try to restore in variants
            if (it.colorName || it.sizeLabel) {
              if (Array.isArray(prod.colors)) {
                const color = prod.colors.find(c => String(c.name).toLowerCase() === String(it.colorName || '').toLowerCase());
                if (color && Array.isArray(color.sizes)) {
                  const size = color.sizes.find(s => String(s.label).toLowerCase() === String(it.sizeLabel || '').toLowerCase());
                  if (size) {
                    size.stock = Number(size.stock || 0) + qty;
                  }
                }
              }
              // Recompute top-level stock as sum of variant sizes
              try {
                let total = 0;
                if (Array.isArray(prod.colors)) {
                  for (const c of prod.colors) {
                    if (Array.isArray(c.sizes)) {
                      for (const s of c.sizes) total += Number(s.stock || 0);
                    }
                  }
                }
                prod.stock = total;
              } catch (e) {}
            } else {
              prod.stock = Number(prod.stock || 0) + qty;
            }

            // decrement sold but not below zero
            prod.sold = Math.max(0, Number(prod.sold || 0) - qty);
            await prod.save();
          } catch (perr) {
            console.warn('Failed to rollback stock for item', it, perr.message);
          }
        }

        // mark as not allocated anymore
        order.stockAllocated = false;
      } catch (rbErr) {
        console.error('❌ Stock rollback error:', rbErr);
      }
    }

    order.status = status;
    await order.save();

    console.log(`📦 Order ${order._id} status changed: ${oldStatus} → ${status}`);

    /* =========================================================
       📧 Send Notification Emails (Admin + Customer) with status-specific templates
    ========================================================== */
    try {
      const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || 'athulsscn@gmail.com';
      const adminUrl = (process.env.APP_ADMIN_URL || 'http://localhost:3000') + `/admin/orders/${order._id}`;

      // Notify Admin
      if (adminEmail) {
        await sendMail({
          to: adminEmail,
          subject: `Order ${order._id} status updated to ${status}`,
          html: `<h3>📦 Order Status Updated</h3>
                 <p><strong>Order ID:</strong> ${order._id}</p>
                 <p><strong>Previous:</strong> ${oldStatus}</p>
                 <p><strong>New Status:</strong> ${status}</p>
                 <p><a href="${adminUrl}" target="_blank">🔗 View Order in Admin Dashboard</a></p>`,
        });
      }

      // Notify Customer with a tailored subject/body for common statuses
      if (order.userEmail) {
        const frontendUrl = process.env.APP_URL || process.env.FRONTEND_URL || 'http://localhost:3000';
        const orderUrl = `${frontendUrl}/my-orders`;
        const itemsSummary = (order.items || []).map(it => `${it.name} x${it.quantity}`).slice(0, 8).join('<br/>');

        let subject = `Your Order ${order._id} is now ${status}`;
        let body = `<p>Hi ${order.customerName || 'Customer'},</p>
                    <p>Your order <strong>${order._id}</strong> status has been updated to <strong>${status}</strong>.</p>
                    <h4>Order Items</h4>
                    <div style="border:1px solid #eee; padding:8px; border-radius:6px">${itemsSummary}</div>
                    <p>You can view full details and download the invoice here: <a href="${orderUrl}">My Orders</a></p>`;

        const st = String(status).toLowerCase();
        if (st === 'packed' || st === 'processing') {
          subject = `Your Kokoru order ${order._id} is being packed`;
          body = `<p>Good news! We're packing your order <strong>${order._id}</strong>. We'll notify you when it ships.</p>${body}`;
        } else if (st === 'shipped') {
          subject = `Your Kokoru order ${order._id} has been shipped`;
          body = `<p>Your order <strong>${order._id}</strong> has been shipped. Track it from your orders page.</p>${body}`;
        } else if (st === 'confirmed') {
          subject = `Your Kokoru order ${order._id} is confirmed`;
          body = `<p>Your order <strong>${order._id}</strong> has been confirmed. We'll start processing it and notify you when it ships.</p>${body}`;
        } else if (st === 'delivered') {
          subject = `Your Kokoru order ${order._id} was delivered`;
          body = `<p>Your order <strong>${order._id}</strong> has been delivered. We hope you enjoy it!</p>${body}`;
        } else if (st === 'cancelled' || st === 'refunded' || st === 'canceled') {
          subject = `Your Kokoru order ${order._id} was ${status}`;
          body = `<p>Your order <strong>${order._id}</strong> has been ${status}. If this was unexpected, please contact support.</p>${body}`;
        }

        await sendMail({ to: order.userEmail, subject, html: body }).catch(err => console.error('⚠️ Failed to notify customer:', err));
      }
    } catch (mailErr) {
      console.error('❌ Failed to send notification emails:', mailErr);
    }

    res.json({ success: true, message: `Order ${order._id} status updated to ${status}`, order });
  } catch (err) {
    console.error("❌ Error updating order status:", err);
    res.status(500).json({ message: "Error updating order status" });
  }
});

// 🗑 Delete Order (Admin only)
router.delete("/:id", adminAuth, async (req, res) => {
  try {
    const { id } = req.params;
    const order = await Order.findById(id);
    if (!order) return res.status(404).json({ message: "Order not found" });

    await Order.findByIdAndDelete(id);
    res.json({ success: true, message: "Order deleted successfully" });
  } catch (err) {
    console.error("❌ Delete Order Error:", err);
    res.status(500).json({ message: "Failed to delete order" });
  }
});


module.exports = router;
