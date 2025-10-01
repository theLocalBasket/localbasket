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

const app = express();
const PORT = process.env.PORT || 3000;

const Database = require("better-sqlite3");
const db = new Database("./products.db");


// ========================
// Security & Middleware
// ========================

// ---------- Block direct access to raw JS ----------
app.use('/js', (req, res) => res.status(404).send('Not found'));
app.use('/css', (req, res) => res.status(404).send('Not found'));


app.use(express.json());

app.disable("x-powered-by");

// Initialize Razorpay
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,        // PUBLIC
  key_secret: process.env.RAZORPAY_KEY_SECRET // SECRET, never expose to frontend
});

// Rate limiter
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: "Too many requests, please try again later."
});

// Core middleware
app.use(cors());
app.use(express.json({ limit: "10kb" }));
app.use(express.static("public"));

// Security headers
app.use(
  helmet.contentSecurityPolicy({
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "https://cdn.jsdelivr.net",
        "https://checkout.razorpay.com",
        "'unsafe-inline'"
      ],
      styleSrc: [
        "'self'",
        "https://cdn.jsdelivr.net",
        "https://fonts.googleapis.com",
        "'unsafe-inline'"
      ],
      imgSrc: ["'self'", "data:", "https:"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: [
        "'self'",
        "https://api.razorpay.com",
        "https://lumberjack.razorpay.com",
        process.env.FRONTEND_URL || "'self'"
      ],
      frameSrc: ["https://checkout.razorpay.com"],
      objectSrc: ["'none'"]
    }
  })
);

// ========================
// Nodemailer Setup
// ========================
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  rateDelta: 60000,
  rateLimit: 10
});

// ========================
// Helpers
// ========================
const sanitize = (str = "") => str.replace(/</g, "&lt;").replace(/>/g, "&gt;");

// ========================
// Routes
// ========================

// Health check
app.get("/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "Email + Razorpay API",
    version: "1.0.0"
  });
});

// Create Razorpay order
app.post("/create-razorpay-order", async (req, res) => {
  try {
    const { amount, currency } = req.body;

    if(!amount || amount <= 0) return res.status(400).json({ success:false, error:"Invalid amount" });

    const options = {
      amount: amount * 100, // amount in paise
      currency: currency || "INR",
      receipt: "order_rcptid_" + Date.now()
    };

    const order = await razorpay.orders.create(options);

    res.json({
      success: true,
      order: {
        id: order.id,
        amount: order.amount,
        currency: order.currency,
        key_id: process.env.RAZORPAY_KEY_ID // send PUBLIC key to frontend
      }
    });

  } catch (err) {
    console.error("Razorpay order error:", err);
    res.status(500).json({ success:false, error: err.message });
  }
});

// Send order email
app.post("/send-order", apiLimiter, async (req, res) => {
  try {
    const orderData = req.body;

    if (!orderData.items || orderData.items.length === 0) {
      return res.status(400).json({ success: false, error: "No items in order" });
    }

    const sanitizedOrder = {
      ...orderData,
      shipping: {
        name: sanitize(orderData.shipping.name),
        email: sanitize(orderData.shipping.email),
        address: sanitize(orderData.shipping.address),
        phone: sanitize(orderData.shipping.phone),
      },
      items: orderData.items.map((item) => ({
        ...item,
        name: sanitize(item.name),
      })),
    };

    // Build styled items table
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
          ${sanitizedOrder.items
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

            <td colspan="3" style="padding:8px; text-align:right; font-weight:bold;">Grand Total:</td>
            <td colspan="3" style="padding:8px; text-align:right; font-weight:bold;">Shipping charges: Rs. 80</td>
            <td style="padding:8px; text-align:right; font-weight:bold;">₹${sanitizedOrder.grandTotal}</td>
          </tr>
        </tbody>
      </table>
    `;

    // Email wrapper template
    const wrapEmail = (title, body) => `
      <div style="max-width:600px; margin:0 auto; border:1px solid #eee; border-radius:8px; overflow:hidden; font-family:Arial, sans-serif;">
        <div style="background:#198754; color:white; padding:15px; text-align:center;">
          <h2 style="margin:0;">The Local Basket</h2>
        </div>
        <div style="padding:20px; color:#333; line-height:1.6;">
          <h3 style="color:#198754;">${title}</h3>
          ${body}
          <p style="margin-top:20px; font-size:12px; color:#777;">This is an automated message from The Local Basket. Please do not reply directly.</p>
        </div>
        <div style="background:#f5f5f5; padding:10px; text-align:center; font-size:12px; color:#666;">
          © ${new Date().getFullYear()} The Local Basket. All rights reserved.
        </div>
      </div>
    `;

    // Admin email
    const adminMail = {
      from: `"New Order Notification" <${process.env.EMAIL_USER}>`,
      to: process.env.RECEIVER_EMAIL,
      subject: `🛒 New Order - ₹${sanitizedOrder.grandTotal}`,
      html: wrapEmail(
        "New Order Received",
        `
          <p><strong>Name:</strong> ${sanitizedOrder.shipping.name}</p>
          <p><strong>Email:</strong> ${sanitizedOrder.shipping.email}</p>
          <p><strong>Phone:</strong> ${sanitizedOrder.shipping.phone}</p>
          <p><strong>Address:</strong> ${sanitizedOrder.shipping.address}</p>
          <p><strong>Payment ID:</strong> ${sanitizedOrder.paymentId}</p>
          <h4 style="margin-top:20px;">Order Details:</h4>
          ${itemsTable}
        `
      ),
    };
    await transporter.sendMail(adminMail);

    // Customer email
    const customerMail = {
      from: `"The Local Basket" <${process.env.EMAIL_USER}>`,
      to: sanitizedOrder.shipping.email,
      subject: `✅ Order Confirmation - ₹${sanitizedOrder.grandTotal}`,
      html: wrapEmail(
        "Thank You for Your Order!",
        `
          <p>Hi <strong>${sanitizedOrder.shipping.name}</strong>,</p>
          <p>We have received your order and payment. Below are your order details:</p>
          <p><strong>Payment ID:</strong> ${sanitizedOrder.paymentId}</p>
          ${itemsTable}
          <p style="margin-top:20px;">We’ll notify you once your order is out for delivery. Thank you for shopping with <strong>The Local Basket</strong>!</p>
        `
      ),
    };
    await transporter.sendMail(customerMail);

    res.json({ success: true, message: "Order emails sent successfully" });
  } catch (err) {
    console.error("Error sending order emails:", err);
    res.status(500).json({ success: false, error: err.message });
  }
});


let productCache = null;
let lastFetchTime = 0; // timestamp in ms
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

app.get("/api/products", (req, res) => {
  try {
    const now = Date.now();

    // ✅ Use cache if fresh
    if (productCache && (now - lastFetchTime < CACHE_DURATION)) {
      return res.json({ success: true, products: productCache, cached: true });
    }

    // ❌ If cache expired → query SQLite
    const products = db.prepare("SELECT * FROM products").all();

    // ✅ Save to cache
    productCache = products;
    lastFetchTime = now;

    res.json({ success: true, products, cached: false });

  } catch (err) {
    console.error("Error fetching products:", err);
    res.status(500).json({ success: false, error: "Failed to fetch products" });
  }
});




// 404 handler
app.use((req, res) => {
  res.status(404).json({ success:false, error:"Resource not found" });
});

// Global error handler
app.use((err, req, res, next) => {
  console.error("Server error:", err.stack);
  res.status(500).json({ success:false, error:"Internal server error" });
});



// ========================
// Start Server
// ========================
app.listen(PORT, () => {
  console.log(`🚀 Server running at http://localhost:${PORT}`);
});
