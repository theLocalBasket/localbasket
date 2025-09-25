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

// ========================
// Security & Middleware
// ========================
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

    if(!orderData.items || orderData.items.length === 0)
      return res.status(400).json({ success:false, error:"No items in order" });

    const sanitizedOrder = {
      ...orderData,
      shipping: {
        name: sanitize(orderData.shipping.name),
        email: sanitize(orderData.shipping.email),
        address: sanitize(orderData.shipping.address),
        phone: sanitize(orderData.shipping.phone)
      },
      items: orderData.items.map(item => ({
        ...item,
        name: sanitize(item.name)
      }))
    };

    // Admin email
    const adminMail = {
      from: `"New Order Notification" <${process.env.EMAIL_USER}>`,
      to: process.env.RECEIVER_EMAIL,
      subject: `New Order - ₹${sanitizedOrder.grandTotal}`,
      html: `<h3>New Order Received</h3>
             <p>Name: ${sanitizedOrder.shipping.name}</p>
             <p>Email: ${sanitizedOrder.shipping.email}</p>
             <p>Phone: ${sanitizedOrder.shipping.phone}</p>
             <p>Address: ${sanitizedOrder.shipping.address}</p>
             <p>Payment ID: ${sanitizedOrder.paymentId}</p>`
    };
    await transporter.sendMail(adminMail);

    // Customer email
    const customerMail = {
      from: `"The Local Basket" <${process.env.EMAIL_USER}>`,
      to: sanitizedOrder.shipping.email,
      subject: `Order Confirmation - ₹${sanitizedOrder.grandTotal}`,
      html: `<h3>Thank You for Your Order!</h3>
             <p>Order Amount: ₹${sanitizedOrder.grandTotal}</p>
             <p>Payment ID: ${sanitizedOrder.paymentId}</p>`
    };
    await transporter.sendMail(customerMail);

    res.json({ success:true, message:"Order emails sent successfully" });

  } catch(err) {
    console.error("Error sending order emails:", err);
    res.status(500).json({ success:false, error: err.message });
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
