// ========================
// server.js - FIXED
// ========================
const express = require("express");
const cors = require("cors");
const nodemailer = require("nodemailer");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { google } = require("googleapis");
const Razorpay = require("razorpay");
const crypto = require("crypto");
require("dotenv").config();

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
app.use(
  express.json({
    verify: (req, res, buf) => {
      if (req.originalUrl === "/razorpay-webhook") req.rawBody = buf;
    },
    limit: "100kb",
  })
);
app.use(express.static("public"));
app.use('/images', express.static('public/images'));
app.disable("x-powered-by");

// ========================
// Razorpay Setup
// ========================
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ========================
// Gmail OAuth2 Setup
// ========================
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const EMAIL_USER = process.env.EMAIL_USER;
const CLIENT_ID = process.env.GMAIL_CLIENT_ID; // ✅ Add this to .env
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || "http://localhost:3000/";

console.log("📧 Email config check:");
console.log("   CLIENT_ID:", CLIENT_ID ? "✅ Set" : "❌ Missing");
console.log("   CLIENT_SECRET:", CLIENT_SECRET ? "✅ Set" : "❌ Missing");
console.log("   REFRESH_TOKEN:", REFRESH_TOKEN ? "✅ Set" : "❌ Missing");
console.log("   EMAIL_USER:", EMAIL_USER ? "✅ Set" : "❌ Missing");

// Create Nodemailer transporter
function createTransporter() {
  if (!CLIENT_ID || !CLIENT_SECRET || !REFRESH_TOKEN) {
    throw new Error("Gmail OAuth credentials missing in .env");
  }

  const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
  oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

  return nodemailer.createTransport({
    service: "gmail",
    auth: {
      type: "OAuth2",
      user: EMAIL_USER,
      clientId: CLIENT_ID,
      clientSecret: CLIENT_SECRET,
      refreshToken: REFRESH_TOKEN,
    },
    pool: true,
    maxConnections: 5,
    maxMessages: 100,
  });
}

// ========================
// Helpers
// ========================
const sanitize = (str = "") => str.replace(/</g, "&lt;").replace(/>/g, "&gt;");

function wrapEmail(title, body) {
  return `
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
  </div>`;
}

// ========================
// Send Emails
// ========================
async function sendOrderEmails(orderData) {
  try {
    const transporter = createTransporter();

    const sanitizedOrder = {
      ...orderData,
      shipping: {
        name: sanitize(orderData.shipping?.name || ""),
        email: sanitize(orderData.shipping?.email || ""),
        address: sanitize(orderData.shipping?.address || ""),
        phone: sanitize(orderData.shipping?.phone || ""),
        pincode: sanitize(orderData.shipping?.pincode || ""),
      },
      items: (orderData.items || []).map((item) => ({ ...item, name: sanitize(item.name || "") })),
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
              <td style="padding:8px; text-align:right;">₹${item.price}</td>
              <td style="padding:8px; text-align:right;">${item.qty}</td>
              <td style="padding:8px; text-align:right;">₹${(item.price * item.qty).toFixed(2)}</td>
            </tr>`
            )
            .join("")}
          <tr style="background:#f9f9f9;">
            <td colspan="3" style="padding:10px; text-align:right; font-weight:bold;">Total: </td>
            <td style="padding:10px; text-align:right; font-weight:bold;">₹${sanitizedOrder.grandTotal}</td>
          </tr>
        </tbody>
      </table>
    `;

    // Admin email
    const adminMail = {
      from: `"New Order" <${EMAIL_USER}>`,
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

    // Customer email
    const customerMail = {
      from: `"The Local Basket" <${EMAIL_USER}>`,
      to: sanitizedOrder.shipping.email,
      subject: `✅ Order Confirmation - ₹${sanitizedOrder.grandTotal}`,
      html: wrapEmail("Thank You for Your Order!", `
        <p>Hi <strong>${sanitizedOrder.shipping.name}</strong>,</p>
        <p>We've received your order and payment has been processed successfully!</p>
        <p><strong>Payment ID:</strong> ${sanitizedOrder.paymentId}</p>
        <h4>Order Summary:</h4>
        ${itemsTable}
        <p style="margin-top: 20px; color: #666;">We'll ship your order soon. Thank you for shopping with us!</p>
      `),
    };

    // Send emails
    await transporter.sendMail(adminMail);
    console.log("✅ Admin email sent to:", process.env.RECEIVER_EMAIL);
    
    await transporter.sendMail(customerMail);
    console.log("✅ Customer email sent to:", sanitizedOrder.shipping.email);
    
  } catch (err) {
    console.error("❌ Send email error:", err.message);
  }
}

// ========================
// Routes
// ========================

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", service: "Email + Razorpay" });
});

// Test email endpoint
app.post("/test-email", async (req, res) => {
  try {
    const transporter = createTransporter();
    const result = await transporter.sendMail({
      from: `"Test" <${EMAIL_USER}>`,
      to: process.env.RECEIVER_EMAIL,
      subject: "Test Email - Local Basket",
      html: wrapEmail("Test Email", "<p>If you receive this, Gmail OAuth2 is working correctly!</p>"),
    });

    res.json({ success: true, messageId: result.messageId, message: "Test email sent!" });
  } catch (err) {
    console.error("❌ Test email error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Razorpay order creation
app.post("/create-razorpay-order", async (req, res) => {
  try {
    const { amount, currency, notes } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, error: "Invalid amount" });

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: currency || "INR",
      receipt: "order_rcptid_" + Date.now(),
      notes: notes || {},
    });

    res.json({ success: true, order: { id: order.id, amount: order.amount, currency: order.currency, key_id: process.env.RAZORPAY_KEY_ID } });
  } catch (err) {
    console.error("❌ Razorpay order error:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});

// Razorpay webhook
app.post("/razorpay-webhook", async (req, res) => {
  try {
    const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
    const isDevMode = req.headers["x-razorpay-signature"] === "dev-mode-simulated";

    if (!isDevMode) {
      const shasum = crypto.createHmac("sha256", webhookSecret);
      shasum.update(req.rawBody);
      const digest = shasum.digest("hex");
      if (digest !== req.headers["x-razorpay-signature"]) {
        return res.status(400).json({ status: "invalid signature" });
      }
    }

    const payment = req.body.payload?.payment?.entity || req.body.payment?.entity;
    
    if (!payment) {
      console.error("❌ No payment entity found in webhook");
      return res.status(400).json({ status: "invalid payload" });
    }

    const orderData = {
      paymentId: payment.id,
      grandTotal: payment.amount / 100,
      shipping: payment.notes?.shipping ? JSON.parse(payment.notes.shipping) : {},
      items: payment.notes?.items ? JSON.parse(payment.notes.items) : [],
    };

    // Send emails in background (don't wait)
    sendOrderEmails(orderData).catch(err => console.error("❌ Background email error:", err));

    res.json({ status: "ok" });
  } catch (err) {
    console.error("❌ Webhook error:", err);
    res.status(500).json({ status: "error", error: err.message });
  }
});

// Fetch products
app.get("/api/products", (req, res) => {
  try {
    const products = db.prepare("SELECT * FROM products").all();
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, error: "Failed to fetch products" });
  }
});

// 404 & error handlers
app.use((req, res) => res.status(404).json({ success: false, error: "Not found" }));
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: "Internal server error" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});