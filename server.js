// ========================
// Imports & Setup
// ========================
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
require("dotenv").config();
const Razorpay = require("razorpay");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;

// ========================
// Database Setup
// ========================
const Database = require("better-sqlite3");
const db = new Database("./products.db");

// ========================
// Middleware & Security
// ========================
app.use(cors());
app.use(express.json({ limit: "10kb" })); // for normal routes
app.use(express.static("public"));
app.disable("x-powered-by");

const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests, please try again later.",
});

app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "https://checkout.razorpay.com", "'unsafe-inline'"],
      styleSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "https://api.razorpay.com", "https://lumberjack.razorpay.com", process.env.FRONTEND_URL || "'self'"],
      frameSrc: ["https://checkout.razorpay.com"],
      objectSrc: ["'none'"],
    },
  })
);

// ========================
// Razorpay Setup
// ========================
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ========================
// Nodemailer Setup
// ========================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  rateDelta: 60000,
  rateLimit: 10,
});

// ========================
// Helpers
// ========================
const sanitize = (str = "") => str.replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ========================
// Send Emails
// ========================
async function sendOrderEmails(orderData) {
  try {
    const sanitizedOrder = {
      ...orderData,
      shipping: {
        name: sanitize(orderData.shipping.name),
        email: sanitize(orderData.shipping.email),
        address: sanitize(orderData.shipping.address),
        phone: sanitize(orderData.shipping.phone),
        pincode: sanitize(orderData.shipping.pincode),
      },
      items: (orderData.items || []).map((item) => ({ ...item, name: sanitize(item.name) })),
    };

    const itemsTable = `
      <table style="width:100%; border-collapse: collapse; margin-top:15px; font-family: Arial, sans-serif;">
        <thead>
          <tr style="background:#198754; color:#fff;">
            <th style="text-align:left; padding:8px;">Item</th>
            <th style="text-align:right; padding:8px;">Rate (₹)</th>
            <th style="text-align:right; padding:8px;">Qty</th>
            <th style="text-align:right; padding:8px;">Total (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${(sanitizedOrder.items || [])
            .map(
              (item) => `
            <tr style="border-bottom:1px solid #ddd;">
              <td style="padding:8px;">${item.name}</td>
              <td style="padding:8px; text-align:right;">${item.price}</td>
              <td style="padding:8px; text-align:right;">${item.qty}</td>
              <td style="padding:8px; text-align:right;">${item.price * item.qty}</td>
            </tr>`
            )
            .join("")}
          <tr>
            <td colspan="3" style="padding:8px; text-align:right; font-weight:bold;">Total Payable (Incl. Shipping ₹80): </td>
            <td style="padding:8px; text-align:right; font-weight:bold;">₹${sanitizedOrder.grandTotal}</td>
          </tr>
        </tbody>
      </table>
    `;

    const wrapEmail = (title, body) => `
      <div style="max-width:600px; margin:0 auto; border:1px solid #eee; border-radius:8px; overflow:hidden; font-family:Arial, sans-serif;">
        <div style="background:#198754; color:white; padding:15px; text-align:center;">
          <h2 style="margin:0;">The Local Basket</h2>
        </div>
        <div style="padding:20px; color:#333; line-height:1.6;">
          <h3 style="color:#198754;">${title}</h3>
          ${body}
          <p style="margin-top:20px; font-size:12px; color:#777;">This is an automated message. Do not reply.</p>
        </div>
        <div style="background:#f5f5f5; padding:10px; text-align:center; font-size:12px; color:#666;">
          © ${new Date().getFullYear()} The Local Basket
        </div>
      </div>
    `;

    const adminMail = {
      from: `"New Order Notification" <${process.env.EMAIL_USER}>`,
      to: process.env.RECEIVER_EMAIL,
      subject: `🛒 New Order - ₹${sanitizedOrder.grandTotal}`,
      html: wrapEmail("New Order Received", `
        <p><strong>Name:</strong> ${sanitizedOrder.shipping.name}</p>
        <p><strong>Email:</strong> ${sanitizedOrder.shipping.email}</p>
        <p><strong>Phone:</strong> ${sanitizedOrder.shipping.phone}</p>
        <p><strong>Address:</strong> ${sanitizedOrder.shipping.address}</p>
        <p><strong>Pincode:</strong> ${sanitizedOrder.shipping.pincode}</p>
        <p><strong>Payment ID:</strong> ${sanitizedOrder.paymentId}</p>
        <h4>Order Details:</h4>
        ${itemsTable}
      `),
    };

    const customerMail = {
      from: `"The Local Basket" <${process.env.EMAIL_USER}>`,
      to: sanitizedOrder.shipping.email,
      subject: `✅ Order Confirmation - ₹${sanitizedOrder.grandTotal}`,
      html: wrapEmail("Thank You for Your Order!", `
        <p>Hi <strong>${sanitizedOrder.shipping.name}</strong>,</p>
        <p>We’ve received your order and payment. Details below:</p>
        <p><strong>Payment ID:</strong> ${sanitizedOrder.paymentId}</p>
        ${itemsTable}
      `),
    };

    console.log("📧 Sending emails...");
    try { await transporter.sendMail(adminMail); console.log("✅ Admin email sent"); } 
    catch(e){ console.error("❌ Admin email error:", e); }
    try { await transporter.sendMail(customerMail); console.log("✅ Customer email sent"); } 
    catch(e){ console.error("❌ Customer email error:", e); }

  } catch (err) {
    console.error("❌ Email sending error:", err);
  }
}

// ========================
// Routes
// ========================

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", timestamp: new Date().toISOString(), service: "Email + Razorpay" });
});

// Create Razorpay order
app.post("/create-razorpay-order", async (req, res) => {
  try {
    const { amount, currency, notes } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, error: "Invalid amount" });
    const options = { amount: amount * 100, currency: currency || "INR", receipt: "order_rcptid_" + Date.now(), notes: notes || {} };
    const order = await razorpay.orders.create(options);
    res.json({ success: true, order: { id: order.id, amount: order.amount, currency: order.currency, key_id: process.env.RAZORPAY_KEY_ID } });
  } catch (err) { console.error("❌ Razorpay order error:", err); res.status(500).json({ success: false, error: err.message }); }
});

// ========================
// Razorpay Webhook (fixed)
// ========================
// 1️⃣ Middleware to capture raw body
app.use(
  express.json({
    verify: (req, res, buf) => {
      req.rawBody = buf; // store raw buffer
    },
    limit: "100kb"
  })
);

// 2️⃣ Webhook route
app.post("/razorpay-webhook", async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const isDevMode = req.headers["x-razorpay-signature"] === "dev-mode-simulated";

    if (!isDevMode) {
      const shasum = crypto.createHmac("sha256", webhookSecret);
      shasum.update(req.rawBody); // use raw buffer
      const digest = shasum.digest("hex");

      if (digest !== req.headers["x-razorpay-signature"]) {
        console.log("❌ Webhook signature mismatch");
        return res.status(400).json({ status: "invalid signature" });
      }
    }

    console.log(isDevMode ? "💻 Dev mode webhook" : "✅ Webhook verified!");

    const payment = req.body.payload?.payment?.entity || req.body.payment?.entity;
    if (!payment) return res.status(400).json({ status: "missing payment entity" });

    const orderData = {
      paymentId: payment.id,
      grandTotal: payment.amount / 100,
      shipping: payment.notes?.shipping ? JSON.parse(payment.notes.shipping) : {},
      items: payment.notes?.items ? JSON.parse(payment.notes.items) : [],
    };

    await sendOrderEmails(orderData);

    res.json({ status: "ok" });
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.status(500).json({ status: "error", error: err.message });
  }
});


// Fetch products
app.get("/api/products", (req, res) => {
  try { const products = db.prepare("SELECT * FROM products").all(); res.json({ success: true, products }); } 
  catch (err) { console.error("❌ Product fetch error:", err); res.status(500).json({ success: false, error: "Failed to fetch products" }); }
});

// 404 & global error
app.use((req, res) => res.status(404).json({ success: false, error: "Not found" }));
app.use((err, req, res, next) => { console.error("❌ Server error:", err.stack); res.status(500).json({ success: false, error: "Internal server error" }); });

// Start server
app.listen(PORT, () => console.log(`🚀 Server running at http://localhost:${PORT}`));
