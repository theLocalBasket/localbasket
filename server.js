// ========================
// server.js - Gmail API + Razorpay + Coupons + Products
// Production-ready
// ========================

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const { google } = require("googleapis");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
require("dotenv").config();

const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || "development";

// ========================
// Database Setup
// ========================
const Database = require("better-sqlite3");
const db = new Database("./products.db");

// ========================
// Middleware & Security
// ========================
app.use(cors());
app.use(express.json({ limit: "100kb", verify: (req, res, buf) => {
    if (req.originalUrl === "/razorpay-webhook") req.rawBody = buf;
  }
}));
app.use(express.static("public"));
app.use("/images", express.static("public/images"));
app.use(helmet());
app.disable("x-powered-by");

// ========================
// Razorpay Setup
// ========================
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ========================
// Gmail API Setup
// ========================
const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const EMAIL_USER = process.env.EMAIL_USER;

const REDIRECT_URI = NODE_ENV === "production"
  ? process.env.GMAIL_REDIRECT_URI
  : "http://localhost:3000/oauth2callback";

console.log("📧 Email config check:");
console.log("   CLIENT_ID:", CLIENT_ID ? "✅ Set" : "❌ Missing");
console.log("   CLIENT_SECRET:", CLIENT_SECRET ? "✅ Set" : "❌ Missing");
console.log("   REFRESH_TOKEN:", REFRESH_TOKEN ? "✅ Set" : "❌ Missing");
console.log("   EMAIL_USER:", EMAIL_USER ? "✅ Set" : "❌ Missing");
console.log("   REDIRECT_URI:", REDIRECT_URI);

const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

// ========================
// Gmail Send Function
// ========================
async function sendGmail(to, subject, html) {
  try {
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });
    const encodedSubject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;
    const rawMessage = Buffer.from(
      `From: "The Local Basket" <${EMAIL_USER}>\r\n` +
      `To: ${to}\r\n` +
      `Subject: ${encodedSubject}\r\n` +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: text/html; charset=utf-8\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      Buffer.from(html).toString("base64")
    ).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

    const res = await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: rawMessage },
    });
    console.log(`✅ Gmail sent to ${to}, messageId: ${res.data.id}`);
    return res.data.id;
  } catch (err) {
    console.error("❌ Gmail send error:", err?.response?.data || err.message || err);
    throw err;
  }
}

// ========================
// Helpers
// ========================
const sanitize = (str = "") => String(str).replace(/</g, "&lt;").replace(/>/g, "&gt;");

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
// Send Order Emails
// ========================
async function sendOrderEmails(orderData) {
  try {
    const sanitizedOrder = {
      ...orderData,
      shipping: {
        name: sanitize(orderData.shipping?.name || ""),
        email: sanitize(orderData.shipping?.email || ""),
        address: sanitize(orderData.shipping?.address || ""),
        phone: sanitize(orderData.shipping?.phone || ""),
        pincode: sanitize(orderData.shipping?.pincode || ""),
      },
      items: (orderData.items || []).map(item => ({ ...item, name: sanitize(item.name || "") })),
      couponCode: sanitize(orderData.coupon?.code || "NONE"),
      couponName: sanitize(orderData.coupon?.name || ""),
      discount: parseFloat(orderData.coupon?.discount || 0),
      grandTotal: parseFloat(orderData.grandTotal || 0),
      paymentId: sanitize(orderData.paymentId || "")
    };

    const itemsTable = `
      <table style="width:100%; border-collapse:collapse; margin-top:15px; font-family:'Segoe UI',Arial,sans-serif; font-size:14px;">
        <thead>
          <tr style="background:#198754; color:#fff;">
            <th style="text-align:left; padding:10px;">Item</th>
            <th style="text-align:right; padding:10px;">Rate (₹)</th>
            <th style="text-align:right; padding:10px;">Qty</th>
            <th style="text-align:right; padding:10px;">Total (₹)</th>
          </tr>
        </thead>
        <tbody>
          ${(sanitizedOrder.items || []).map(item => `
            <tr style="border-bottom:1px solid #e0e0e0;">
              <td style="padding:8px;">${item.name}</td>
              <td style="padding:8px; text-align:right;">₹${(parseFloat(item.price) || 0).toFixed(2)}</td>
              <td style="padding:8px; text-align:right;">${item.qty}</td>
              <td style="padding:8px; text-align:right;">₹${((parseFloat(item.price) || 0) * (item.qty || 0)).toFixed(2)}</td>
            </tr>`).join("")}
          ${sanitizedOrder.couponCode !== "NONE" ? `
            <tr style="background:#fff8e1;">
              <td colspan="3" style="padding:10px; text-align:right; font-weight:600; color:#856404;">
                Coupon Applied: ${sanitizedOrder.couponName} (${sanitizedOrder.couponCode})
              </td>
              <td style="padding:10px; text-align:right; font-weight:600; color:#d9534f;">
                - ₹${sanitizedOrder.discount.toFixed(2)}
              </td>
            </tr>` : ""}
          <tr style="background:#f8f9fa;">
            <td colspan="3" style="padding:10px; text-align:right; font-weight:700;">Total (incl. shipping)</td>
            <td style="padding:10px; text-align:right; font-weight:700; color:#198754;">₹${sanitizedOrder.grandTotal.toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    `;

    // Admin Email
    await sendGmail(
      process.env.RECEIVER_EMAIL,
      `🛒 New Order - ₹${sanitizedOrder.grandTotal.toFixed(2)}`,
      wrapEmail("New Order Received", `<p>Customer: ${sanitizedOrder.shipping.name}</p>${itemsTable}`)
    );

    // Customer Email
    await sendGmail(
      sanitizedOrder.shipping.email,
      `✅ Order Confirmation - ₹${sanitizedOrder.grandTotal.toFixed(2)}`,
      wrapEmail("Order Confirmation", `<p>Hi ${sanitizedOrder.shipping.name},</p>${itemsTable}<p>Thank you for shopping!</p>`)
    );

  } catch (err) {
    console.error("❌ [EMAIL ERROR]:", err);
  }
}

// ========================
// Routes
// ========================

// OAuth2 callback (for generating refresh token)
app.get("/oauth2callback", async (req, res) => {
  const code = req.query.code;
  if (!code) return res.status(400).send("Missing code");

  try {
    const { tokens } = await oAuth2Client.getToken(code);
    oAuth2Client.setCredentials(tokens);
    console.log("✅ Gmail API tokens received:", tokens);
    res.send("Gmail API authorized successfully! Copy the refresh_token to your .env");
  } catch (err) {
    console.error("❌ OAuth2 callback error:", err);
    res.status(500).send("Error exchanging code for token");
  }
});

// Test email
app.post("/test-email", async (req, res) => {
  try {
    await sendGmail(
      process.env.RECEIVER_EMAIL,
      "Test Email - Local Basket",
      wrapEmail("Test Email", "<p>If you receive this, Gmail API is working correctly!</p>")
    );
    res.json({ success: true, message: "Test email sent!" });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Razorpay order creation
app.post("/create-razorpay-order", async (req, res) => {
  try {
    const { amount, currency, notes } = req.body;
    if (!amount || amount <= 0) return res.status(400).json({ success: false, error: "Invalid amount" });

    const order = await razorpay.orders.create({
      amount: Math.round(amount * 100),
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
    if (webhookSecret) {
      const shasum = crypto.createHmac("sha256", webhookSecret);
      shasum.update(req.rawBody);
      const digest = shasum.digest("hex");
      if (digest !== req.headers["x-razorpay-signature"]) {
        return res.status(400).json({ status: "invalid signature" });
      }
    }

    const payment = req.body.payload?.payment?.entity || req.body.payment?.entity || req.body;
    if (!payment) return res.status(400).json({ status: "invalid payload" });

    const notes = payment.notes || {};
    const orderData = {
      paymentId: payment.id,
      grandTotal: (payment.amount || 0) / 100,
      shipping: notes.shipping ? JSON.parse(String(notes.shipping)) : {},
      items: notes.items ? JSON.parse(String(notes.items)) : [],
      coupon: notes.coupon ? JSON.parse(String(notes.coupon)) : null,
    };

    sendOrderEmails(orderData).then(() => console.log("📧 [WEBHOOK] Emails sent."))
      .catch(err => console.error("❌ [WEBHOOK] Email send error:", err));

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

// Fetch coupons
app.get("/api/coupons", (req, res) => {
  try {
    const filePath = path.join(process.cwd(), "coupons.json");
    const coupons = JSON.parse(fs.readFileSync(filePath, "utf8"));
    res.json(coupons);
  } catch (err) {
    res.status(500).json({ error: "Failed to load coupons" });
  }
});

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "OK", service: "Email + Razorpay" });
});

// 404 handler
app.use((req, res) => res.status(404).json({ success: false, error: "Not found" }));

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ success: false, error: "Internal server error" });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
