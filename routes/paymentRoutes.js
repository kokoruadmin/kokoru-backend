// backend/routes/paymentRoutes.js
const express = require("express");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const Product = require("../models/product");
const Order = require("../models/Order");
const { sendMail } = require("../utils/mailer");

const router = express.Router();

// Razorpay instance
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

/* CREATE RAZORPAY ORDER */
router.post("/create-order", async (req, res) => {
  try {
    const options = {
      amount: Number(req.body.amount || 0) * 100,
      currency: "INR",
      receipt: `receipt_${Date.now()}`,
    };
    const order = await razorpay.orders.create(options);
    res.json(order);
  } catch (err) {
    console.error("❌ Error creating Razorpay order:", err);
    res.status(500).send("Error creating Razorpay order");
  }
});

/* VERIFY PAYMENT - validate signature and availability; do NOT mutate stock here. */
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
  // verify signature
    const body = (razorpay_order_id || "") + "|" + (razorpay_payment_id || "");
    const expected = crypto.createHmac("sha256", process.env.RAZORPAY_KEY_SECRET).update(body).digest("hex");
    if (expected !== razorpay_signature) return res.status(400).json({ success: false, message: "Invalid payment signature" });

    // validate address/contact
    const missing = [];
    if (!address || typeof address !== "object") missing.push("address");
    else {
      if (!address.address || !String(address.address).trim()) missing.push("address_text");
      const p = String(address.pincode || "").replace(/\s+/g, "");
      if (!/^\d{6}$/.test(p)) missing.push("pincode");
      const rawMobile = String(contact || address.mobile || "");
      const mobileDigits = rawMobile.replace(/\D/g, "");
      if (mobileDigits.length !== 10) missing.push("contact");
    }
    if (missing.length > 0) return res.status(400).json({ success: false, message: "Missing or invalid required address/contact fields", missingFields: missing });

    // availability checks only (no stock mutation)
    const items = Array.isArray(cart) ? cart : [];
    for (const item of items) {
      const { _id, colorName, sizeLabel, quantity } = item;
      const product = await Product.findById(_id);
      if (!product) return res.status(404).json({ success: false, message: `Product not found (${_id})` });
      const qty = parseInt(quantity) || 1;
      const maxOrder = product.maxOrder || 10;
      if (Array.isArray(product.colors) && colorName && sizeLabel) {
        const color = product.colors.find((c) => String(c.name).toLowerCase() === String(colorName).toLowerCase());
        if (!color) return res.status(400).json({ success: false, message: `Color '${colorName}' not found for ${product.name}` });
        const size = (color.sizes || []).find((s) => String(s.label).toLowerCase() === String(sizeLabel).toLowerCase());
        if (!size) return res.status(400).json({ success: false, message: `Size '${sizeLabel}' not found for ${product.name} (${colorName})` });
        if (qty > size.stock) return res.status(400).json({ success: false, message: `Not enough stock for ${product.name} (${colorName} - ${sizeLabel}).` });
        if (qty > maxOrder) return res.status(400).json({ success: false, message: `Max allowed per order for ${product.name} is ${maxOrder}` });
      } else {
        if (qty > product.stock) return res.status(400).json({ success: false, message: `Not enough stock for ${product.name}.` });
        if (qty > maxOrder) return res.status(400).json({ success: false, message: `Max allowed per order for ${product.name} is ${maxOrder}` });
      }
    }

    // If frontend didn't include userEmail (or for extra safety), try to extract from Authorization JWT token so
    // orders created by logged-in users are always associated with their account. This is a non-breaking enhancement
    // and will not error if no token is present.
    try {
      const auth = req.headers.authorization;
      if ((!userEmail || !String(userEmail).trim()) && auth && auth.startsWith("Bearer ")) {
        try {
          const decoded = jwt.verify(auth.split(" ")[1], process.env.JWT_SECRET || "kokoru_secret");
          if (decoded && decoded.email) {
            // prefer decoded email when frontend did not send userEmail
            userEmail = decoded.email;
          }
          if ((!customerName || !String(customerName).trim()) && decoded && decoded.name) {
            customerName = decoded.name;
          }
        } catch (e) {
          // ignore invalid token — we'll continue using provided values
        }
      }
    } catch (e) {
      // swallow
    }

    // create order record (payment succeeded). stockAllocated remains false until admin confirms
    const frontendCoupon = req.body.coupon || null;
    const frontendDiscountAmount = typeof req.body.discountAmount !== "undefined" ? req.body.discountAmount : 0;
    const frontendTotalAfterDiscount = typeof req.body.totalAfterDiscount !== "undefined" ? req.body.totalAfterDiscount : undefined;

    const orderDoc = new Order({
      userEmail,
      customerName: (customerName && String(customerName).trim()) || (address && (address.name || address.label)) || userEmail || "Guest",
      contact,
      address,
      items: items.map((it) => ({
        productId: it._id,
        name: it.name,
        price: it.ourPrice || it.price,
        quantity: it.quantity,
        colorName: it.colorName,
        sizeLabel: it.sizeLabel,
      })),
      amount: items.reduce((s, i) => s + (i.ourPrice || i.price) * i.quantity, 0),
      paymentId: razorpay_payment_id,
      status: "paid",
      stockAllocated: false,
      coupon: frontendCoupon ? {
        code: frontendCoupon.code,
        discountType: frontendCoupon.discountType,
        discountValue: frontendCoupon.discountValue,
        discountAmount: frontendDiscountAmount,
      } : null,
      discountAmount: frontendDiscountAmount || 0,
      totalAfterDiscount: typeof frontendTotalAfterDiscount !== "undefined" ? frontendTotalAfterDiscount : items.reduce((s, i) => s + (i.ourPrice || i.price) * i.quantity, 0),
    });

    const savedOrder = await orderDoc.save();

    // notify admin
    try {
      const adminEmail = process.env.ADMIN_NOTIFICATION_EMAIL || "athulsscn@gmail.com";
      if (adminEmail) {
        const adminUrl = (process.env.APP_ADMIN_URL || "http://localhost:3000") + `/admin/orders/${savedOrder._id}`;
        const html = `
          <h3>🛍️ New Order Received</h3>
          <p><strong>Order ID:</strong> ${savedOrder._id}</p>
          <p><strong>Amount:</strong> ₹${savedOrder.amount}</p>
          <p><strong>Customer:</strong> ${savedOrder.customerName}</p>
          <p><a href="${adminUrl}" target="_blank">🔗 View Order in Admin Dashboard</a></p>
        `;
        await sendMail({ to: adminEmail, subject: `New Order Received - ${savedOrder._id}`, html });
      }
    } catch (e) {
      console.error("❌ Failed to send admin notification:", e);
    }

    // notify customer if email available
    try {
      const candidateEmail = (savedOrder.userEmail && String(savedOrder.userEmail).trim()) || (savedOrder.address && savedOrder.address.email && String(savedOrder.address.email).trim()) || (savedOrder.contact && String(savedOrder.contact).includes("@") ? String(savedOrder.contact).trim() : null);
      if (candidateEmail) {
        const frontendUrl = process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:3000";
        const orderUrl = `${frontendUrl}/my-orders`;
        const itemsHtml = (savedOrder.items || []).map((it) => `<tr><td style="padding:6px;border:1px solid #eee">${it.name}</td><td style="padding:6px;border:1px solid #eee">${[it.colorName, it.sizeLabel].filter(Boolean).join(' / ') || '-'}</td><td style="padding:6px;border:1px solid #eee;text-align:right">₹${it.price}</td><td style="padding:6px;border:1px solid #eee;text-align:center">${it.quantity}</td><td style="padding:6px;border:1px solid #eee;text-align:right">₹${(it.price * it.quantity).toFixed(2)}</td></tr>`).join("");
        const subtotal = Number(savedOrder.amount || 0).toFixed(2);
        const discount = Number(savedOrder.discountAmount || 0).toFixed(2);
        const net = typeof savedOrder.totalAfterDiscount !== 'undefined' && savedOrder.totalAfterDiscount !== null ? Number(savedOrder.totalAfterDiscount).toFixed(2) : (Number(savedOrder.amount || 0) - Number(savedOrder.discountAmount || 0)).toFixed(2);
        const customerHtml = `
          <div style="font-family:Arial, Helvetica, sans-serif; color:#111; max-width:700px; margin:0 auto; padding:18px;">
            <h2 style="color:#6b21a8">Kokoru - Order Confirmation</h2>
            <p>Hi ${savedOrder.customerName || candidateEmail || 'Customer'},</p>
            <p>Thank you for your order. Your payment was successful and we've created your order <strong>${savedOrder._id}</strong>.</p>
            <h3 style="margin-top:18px">Order Summary</h3>
            <table style="width:100%; border-collapse:collapse; margin-top:8px;">
              <thead>
                <tr>
                  <th style="text-align:left; padding:6px; background:#f3e8ff">Product</th>
                  <th style="text-align:left; padding:6px; background:#f3e8ff">Variant</th>
                  <th style="text-align:right; padding:6px; background:#f3e8ff">Price</th>
                  <th style="text-align:center; padding:6px; background:#f3e8ff">Qty</th>
                  <th style="text-align:right; padding:6px; background:#f3e8ff">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                ${itemsHtml}
              </tbody>
            </table>
            <div style="text-align:right; margin-top:12px;">
              <div>Subtotal: ₹${subtotal}</div>
              ${Number(discount) > 0 ? `<div style="color:#059669">Discount: -₹${discount}</div>` : ''}
              <div style="font-weight:700; margin-top:6px; font-size:16px; color:#4b0082">Net Amount: ₹${net}</div>
            </div>
            <h4 style="margin-top:20px">Shipping To</h4>
            <div style="border:1px solid #eee; padding:10px; border-radius:6px;">
              <div><strong>${savedOrder.customerName || ''}</strong></div>
              <div>${savedOrder.address?.address || ''}</div>
              ${savedOrder.address?.place ? `<div>${savedOrder.address.place}</div>` : ''}
              ${savedOrder.address?.district ? `<div>${savedOrder.address.district}</div>` : ''}
              ${savedOrder.address?.state ? `<div>${savedOrder.address.state}</div>` : ''}
              ${savedOrder.address?.pincode ? `<div>Pincode: ${savedOrder.address.pincode}</div>` : ''}
              <div>Contact: ${savedOrder.contact || savedOrder.address?.mobile || ''}</div>
            </div>
            <p style="margin-top:18px">You can view your order and download the invoice from your account: <a href="${orderUrl}">My Orders</a></p>
            <p style="color:#666; font-size:13px; margin-top:18px">If you have any questions, reply to this email or contact our support.</p>
            <div style="margin-top:18px; color:#999; font-size:12px">Kokoru • Elegant & Handmade with Love</div>
          </div>
        `;
        await sendMail({ to: candidateEmail, subject: `Your Kokoru Order ${savedOrder._id} — Confirmation & Invoice`, html: customerHtml });
      }
    } catch (e) {
      console.error("❌ Failed to send customer notification email:", e);
    }

    return res.json({ success: true, message: "Order created (payment verified).", orderId: savedOrder._id });
  } catch (error) {
    console.error("❌ Error verifying payment:", error);
    return res.status(500).json({ success: false, message: "Error verifying payment or creating order" });
  }
});

module.exports = router;
