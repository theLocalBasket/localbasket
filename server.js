// ========================
// Imports & Setup
// ========================
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;

// ========================
// Security & Middleware
// ========================
app.disable("x-powered-by");

// Rate limiting
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests, please try again later.",
});

// Core middleware
app.use(cors());
app.use(express.json({ limit: "10kb" })); // ✅ use built-in JSON parser
app.use(express.static("public", {
  maxAge: "1d",
  setHeaders: (res, path) => {
    if (path.endsWith(".html")) {
      res.setHeader("Cache-Control", "no-cache, no-store");
    }
  },
}));

// Security headers
app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
    styleSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
    fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com"],
    connectSrc: ["'self'", "https://your-api-domain.com"],
    objectSrc: ["'none'"],
  },
}));

// Apply rate limiting to API routes
app.use("/send-query", apiLimiter);

// ========================
// Nodemailer Setup
// ========================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  rateDelta: 60000,
  rateLimit: 10,
});

// ========================
// Helpers
// ========================
const sanitize = (str = "") =>
  str.replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ========================
// Routes
// ========================

// ✅ Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "Email API",
    version: "1.0.0",
  });
});

// ✅ Order handling
app.post("/send-order", async (req, res) => {
  try {
    const orderData = req.body;

    if (!orderData.items || orderData.items.length === 0) {
      return res.status(400).json({ success: false, error: "No items in order" });
    }

    // Sanitize order
    const sanitizedOrder = {
      ...orderData,
      shipping: {
        email: sanitize(orderData.shipping.email),
        name: sanitize(orderData.shipping.name),
        address: sanitize(orderData.shipping.address),
        phone: sanitize(orderData.shipping.phone),
      },
      items: orderData.items.map((item) => ({
        id: item.id,
        img: item.img,
        name: sanitize(item.name),
        price: item.price,
        qty: item.qty,
      })),
    };

    // Send emails
    const adminMail = {
      from: `"New Order Notification" <${process.env.EMAIL_USER}>`,
      to: process.env.RECEIVER_EMAIL,
      subject: `New Order Received - ₹${sanitizedOrder.grandTotal.toLocaleString()}`,
      html: createOrderEmailTemplate(sanitizedOrder),
      text: createOrderTextTemplate(sanitizedOrder),
    };

    const info = await transporter.sendMail(adminMail);

    const customerMail = {
      from: `"${process.env.STORE_NAME || "Support Team"}" <${process.env.EMAIL_USER}>`,
      to: sanitizedOrder.shipping.email,
      subject: `Your Order Confirmation - ₹${sanitizedOrder.grandTotal.toLocaleString()}`,
      html: createCustomerEmailTemplate(sanitizedOrder),
      text: createOrderTextTemplate(sanitizedOrder),
    };

    const customerInfo = await transporter.sendMail(customerMail);

    res.status(200).json({
      success: true,
      message: "Order received successfully!",
      adminMessageId: info.messageId,
      customerMessageId: customerInfo.messageId,
    });
  } catch (err) {
    console.error("❌ Error processing order:", err);
    res.status(500).json({
      success: false,
      error: "Error processing order",
      details: err.message,
    });
  }
});

// ========================
// Templates
// ========================
function createOrderEmailTemplate(order) {
  const itemsHtml = order.items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">${item.name}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center;">${item.qty}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">₹${(item.price * item.qty).toLocaleString()}</td>
        </tr>`
    )
    .join("");

  return `
  <div style="font-family: Arial, sans-serif; max-width:600px; margin:auto; background:#f9f9f9; padding:20px; border-radius:8px;">
    <h2 style="color:#333; text-align:center;">📦 New Order Received</h2>
    <p><strong>Customer Name:</strong> ${order.shipping.name}</p>
    <p><strong>Email:</strong> ${order.shipping.email}</p>
    <p><strong>Phone:</strong> ${order.shipping.phone}</p>
    <p><strong>Address:</strong> ${order.shipping.address}</p>

    <h3 style="margin-top:20px;">Order Details</h3>
    <table style="width:100%; border-collapse:collapse; margin-top:10px;">
      <thead>
        <tr style="background:#eee;">
          <th style="padding:8px;border:1px solid #ddd;text-align:left;">Item</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:center;">Qty</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <p style="font-size:16px; margin-top:20px; text-align:right;">
      <strong>Grand Total: ₹${order.grandTotal.toLocaleString()}</strong>
    </p>

    <hr style="margin:20px 0;">
    <p style="font-size:12px; color:#777; text-align:center;">
      This order was generated from your store system.
    </p>
  </div>`;
}


function createOrderTextTemplate(order) {
  return `NEW ORDER\n
Customer: ${order.shipping.name}
Email: ${order.shipping.email}
Total: ₹${order.grandTotal}
Items:
${order.items.map((i) => `- ${i.name} x${i.qty} = ₹${i.price * i.qty}`).join("\n")}`;
}

function createCustomerEmailTemplate(order) {
  const itemsHtml = order.items
    .map(
      (item) => `
        <tr>
          <td style="padding:8px;border:1px solid #ddd;">${item.name}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:center;">${item.qty}</td>
          <td style="padding:8px;border:1px solid #ddd;text-align:right;">₹${(item.price * item.qty).toLocaleString()}</td>
        </tr>`
    )
    .join("");

  return `
  <div style="font-family: Arial, sans-serif; max-width:600px; margin:auto; background:#ffffff; padding:20px; border-radius:8px; border:1px solid #eee;">
    <h2 style="color:#2c3e50; text-align:center;">Thank You for Your Order! 🎉</h2>
    <p style="font-size:15px;">Hi <strong>${order.shipping.name}</strong>,</p>
    <p>We’ve received your order and are preparing it for shipment. You’ll receive another update when it’s on the way.</p>

    <h3 style="margin-top:20px;">Your Order Summary</h3>
    <table style="width:100%; border-collapse:collapse; margin-top:10px;">
      <thead>
        <tr style="background:#f4f4f4;">
          <th style="padding:8px;border:1px solid #ddd;text-align:left;">Item</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:center;">Qty</th>
          <th style="padding:8px;border:1px solid #ddd;text-align:right;">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemsHtml}
      </tbody>
    </table>

    <p style="font-size:16px; margin-top:20px; text-align:right;">
      <strong>Grand Total: ₹${order.grandTotal.toLocaleString()}</strong>
    </p>

    <div style="margin-top:30px; text-align:center;">
      <p style="font-size:14px; color:#555;">
        📍 Shipping to:<br>
        ${order.shipping.address}<br>
        📞 ${order.shipping.phone}
      </p>
    </div>

    <hr style="margin:20px 0;">
    <p style="font-size:13px; color:#777; text-align:center;">
      Thank you for shopping with <strong>${process.env.STORE_NAME || "Our Store"}</strong>.<br>
      If you have any questions, reply to this email and we’ll be happy to help.
    </p>
  </div>`;
}

// ========================
// Error Handlers
// ========================
app.use((req, res) => {
  res.status(404).json({ success: false, error: "Resource not found" });
});

app.use((err, req, res, next) => {
  console.error("🔥 Server error:", err.stack);
  res.status(500).json({ success: false, error: "Internal server error" });
});

// ========================
// Server
// ========================
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
  console.log(`✉️  Email service: ${process.env.EMAIL_USER}`);
});

process.on("SIGTERM", () => {
  console.log("🛑 SIGTERM received. Shutting down...");
  server.close(() => process.exit(0));
});

process.on("SIGINT", () => {
  console.log("🛑 SIGINT received. Shutting down...");
  server.close(() => process.exit(0));
});
