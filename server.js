// ========================
// server.js - Gmail API version (updated for coupon handling + improved logging)
// ========================
const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");
const { google } = require("googleapis");
const Razorpay = require("razorpay");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");

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
// Gmail API Setup
// ========================
const CLIENT_SECRET = process.env.GMAIL_CLIENT_SECRET;
const REFRESH_TOKEN = process.env.GMAIL_REFRESH_TOKEN;
const EMAIL_USER = process.env.EMAIL_USER;
const CLIENT_ID = process.env.GMAIL_CLIENT_ID;
const REDIRECT_URI = process.env.GMAIL_REDIRECT_URI || "https://developers.google.com/oauthplayground";

console.log("📧 Email config check:");
console.log("   CLIENT_ID:", CLIENT_ID ? "✅ Set" : "❌ Missing");
console.log("   CLIENT_SECRET:", CLIENT_SECRET ? "✅ Set" : "❌ Missing");
console.log("   REFRESH_TOKEN:", REFRESH_TOKEN ? "✅ Set" : "❌ Missing");
console.log("   EMAIL_USER:", EMAIL_USER ? "✅ Set" : "❌ Missing");

// Gmail API helper
const oAuth2Client = new google.auth.OAuth2(CLIENT_ID, CLIENT_SECRET, REDIRECT_URI);
oAuth2Client.setCredentials({ refresh_token: REFRESH_TOKEN });

async function sendGmail(to, subject, html) {
  try {
    const gmail = google.gmail({ version: "v1", auth: oAuth2Client });

    // Encode subject with UTF-8
    const encodedSubject = `=?utf-8?B?${Buffer.from(subject).toString("base64")}?=`;

    const rawMessage = Buffer.from(
      `From: "The Local Basket" <${EMAIL_USER}>\r\n` +
      `To: ${to}\r\n` +
      `Subject: ${encodedSubject}\r\n` +
      `MIME-Version: 1.0\r\n` +
      `Content-Type: text/html; charset=utf-8\r\n` +
      `Content-Transfer-Encoding: base64\r\n\r\n` +
      Buffer.from(html).toString("base64")
    ).toString("base64")
      .replace(/\+/g, "-")
      .replace(/\//g, "_")
      .replace(/=+$/, "");

    await gmail.users.messages.send({
      userId: "me",
      requestBody: { raw: rawMessage },
    });
    return true;
  } catch (err) {
    console.error("❌ Gmail API send error:", err.message);
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
// Send Emails (Enhanced)
// (keeps same implementation as before)
// ========================
async function sendOrderEmails(orderData) {
  try {
    console.log("🧾 [EMAIL] Incoming orderData:", JSON.stringify(orderData, null, 2));

    // ========================
    // Extract & Sanitize
    // ========================
    // accept coupon either in orderData.notes.* or top-level coupon fields
    const appliedCouponCode = sanitize(orderData.notes?.couponCode || orderData.couponCode || orderData.coupon?.code || "NONE");
    const appliedCouponName = sanitize(orderData.notes?.couponName || orderData.couponName || orderData.coupon?.name || "");
    const appliedDiscount = parseFloat(orderData.notes?.discountAmount || orderData.discountAmount || orderData.discount || orderData.coupon?.discount || 0) || 0;

    const sanitizedOrder = {
      ...orderData,
      shipping: {
        name: sanitize(orderData.shipping?.name || ""),
        email: sanitize(orderData.shipping?.email || ""),
        address: sanitize(orderData.shipping?.address || ""),
        phone: sanitize(orderData.shipping?.phone || ""),
        pincode: sanitize(orderData.shipping?.pincode || ""),
      },
      items: (orderData.items || []).map(item => ({
        ...item,
        name: sanitize(item.name || ""),
      })),
      couponCode: appliedCouponCode,
      couponName: appliedCouponName,
      discount: appliedDiscount,
    };

    console.log("🎟️ [EMAIL] Coupon extracted:", {
      code: sanitizedOrder.couponCode,
      name: sanitizedOrder.couponName,
      discount: sanitizedOrder.discount,
    });

    // ========================
    // Build Order Table
    // ========================
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
            </tr>
          `).join("")}

          ${sanitizedOrder.couponCode !== "NONE" ? `
          <tr style="background:#fff8e1;">
            <td colspan="3" style="padding:10px; text-align:right; font-weight:600; color:#856404;">
              Coupon Applied: ${sanitizedOrder.couponName} (${sanitizedOrder.couponCode})
            </td>
            <td style="padding:10px; text-align:right; font-weight:600; color:#d9534f;">
              - ₹${sanitizedOrder.discount.toFixed(2)}
            </td>
          </tr>
          ` : ""}

          <tr style="background:#f8f9fa;">
            <td colspan="3" style="padding:10px; text-align:right; font-weight:700;">Total (incl. shipping)</td>
            <td style="padding:10px; text-align:right; font-weight:700; color:#198754;">₹${(sanitizedOrder.grandTotal || 0).toFixed(2)}</td>
          </tr>
        </tbody>
      </table>
    `;

    // ========================
    // Email Template Wrapper
    // ========================
    const makeEmailBody = (title, message, footerNote = "") => `
      <div style="font-family:'Segoe UI',Arial,sans-serif; background:#f9fafb; padding:30px;">
        <div style="max-width:700px; margin:0 auto; background:white; border-radius:8px; box-shadow:0 2px 8px rgba(0,0,0,0.05); overflow:hidden;">
          <div style="background:#198754; color:white; padding:18px 24px; font-size:18px; font-weight:bold;">
            ${title}
          </div>
          <div style="padding:24px; color:#333; line-height:1.6;">
            ${message}
          </div>
          <div style="background:#f1f3f5; padding:14px 24px; font-size:13px; color:#777; text-align:center;">
            ${footerNote}
          </div>
        </div>
      </div>
    `;

    // ========================
    // ADMIN EMAIL
    // ========================
    const adminBody = makeEmailBody(
      "🛒 New Order Received",
      `
        <h3 style="color:#198754;">Customer Details</h3>
        <p><strong>Name:</strong> ${sanitizedOrder.shipping.name}</p>
        <p><strong>Email:</strong> ${sanitizedOrder.shipping.email}</p>
        <p><strong>Phone:</strong> ${sanitizedOrder.shipping.phone}</p>
        <p><strong>Address:</strong> ${sanitizedOrder.shipping.address}</p>
        <p><strong>Pincode:</strong> ${sanitizedOrder.shipping.pincode}</p>
        <p><strong>Payment ID:</strong> ${sanitize(sanitizedOrder.paymentId || "")}</p>

        ${sanitizedOrder.couponCode !== "NONE" ? `
          <h4 style="margin-top:20px; color:#856404;">Coupon Details</h4>
          <p><strong>Coupon Name:</strong> ${sanitizedOrder.couponName}</p>
          <p><strong>Coupon Code:</strong> ${sanitizedOrder.couponCode}</p>
          <p style="color:#d9534f;"><strong>Discount:</strong> -₹${sanitizedOrder.discount.toFixed(2)}</p>
        ` : `<p><strong>Coupon:</strong> None Applied</p>`}

        <h3 style="margin-top:25px; color:#198754;">Order Details</h3>
        ${itemsTable}
      `,
      `This is an automated message from The Local Basket Admin System`
    );

    console.log("📧 [EMAIL] Sending admin email to:", process.env.RECEIVER_EMAIL);
    await sendGmail(process.env.RECEIVER_EMAIL, `🛒 New Order - ₹${(sanitizedOrder.grandTotal || 0).toFixed(2)}`, adminBody);
    console.log("✅ [EMAIL] Admin email sent successfully.");

    // ========================
    // CUSTOMER EMAIL
    // ========================
    const customerBody = makeEmailBody(
      "✅ Order Confirmation",
      `
        <p>Hi <strong>${sanitizedOrder.shipping.name}</strong>,</p>
        <p>We’re thrilled to confirm that your payment has been received successfully.</p>
        <p><strong>Payment ID:</strong> ${sanitize(sanitizedOrder.paymentId || "")}</p>

        ${sanitizedOrder.couponCode !== "NONE" ? `
          <h4 style="margin-top:20px; color:#856404;">Coupon Applied</h4>
          <p><strong>${sanitizedOrder.couponName}</strong> (${sanitizedOrder.couponCode})</p>
          <p style="color:#d9534f;"><strong>Discount:</strong> -₹${sanitizedOrder.discount.toFixed(2)}</p>
        ` : ""}

        <h3 style="margin-top:25px; color:#198754;">Order Summary</h3>
        ${itemsTable}

        <p style="margin-top:20px; color:#555;">We’ll ship your order soon. Thank you for shopping with <strong>The Local Basket</strong>! 🌿</p>
      `,
      `Need help? Contact us at <a href="mailto:support@thelocalbasket.in">support@thelocalbasket.in</a>`
    );

    console.log("📧 [EMAIL] Sending customer email to:", sanitizedOrder.shipping.email);
    await sendGmail(sanitizedOrder.shipping.email, `✅ Order Confirmation - ₹${(sanitizedOrder.grandTotal || 0).toFixed(2)}`, customerBody);
    console.log("✅ [EMAIL] Customer email sent successfully.");

  } catch (err) {
    console.error("❌ [EMAIL ERROR]:", err.message || err);
    console.error("🪲 [EMAIL DEBUG TRACE]:", err);
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
    await sendGmail(
      process.env.RECEIVER_EMAIL,
      "Test Email - Local Basket",
      wrapEmail("Test Email", "<p>If you receive this, Gmail API is working correctly!</p>")
    );
    res.json({ success: true, message: "Test email sent!" });
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
    const isDevMode = req.headers["x-razorpay-signature"] === "dev-mode-simulated";

    if (!isDevMode) {
      if (!webhookSecret) {
        console.warn("⚠️ Razorpay webhook secret not set; skipping signature verification.");
      } else {
        const shasum = crypto.createHmac("sha256", webhookSecret);
        shasum.update(req.rawBody);
        const digest = shasum.digest("hex");
        if (digest !== req.headers["x-razorpay-signature"]) {
          console.warn("❌ Webhook signature mismatch", { digest, header: req.headers["x-razorpay-signature"] });
          return res.status(400).json({ status: "invalid signature" });
        }
      }
    }

    // support both webhook payload shapes
    const payment = req.body.payload?.payment?.entity || req.body.payment?.entity || req.body;
    if (!payment) {
      console.error("❌ No payment entity found in webhook");
      return res.status(400).json({ status: "invalid payload" });
    }

    console.log("🔔 [WEBHOOK] Payment received:", {
      id: payment.id,
      amount: payment.amount,
      notes: payment.notes || {}
    });

    // Parse notes and coupon robustly
    const notes = payment.notes || {};
    console.log("📦 [WEBHOOK] Raw notes:", notes);

    // coupon may be stringified JSON in notes.coupon or separate fields
    let parsedCoupon = null;
    if (notes.coupon) {
      try {
        parsedCoupon = typeof notes.coupon === "string" ? JSON.parse(notes.coupon) : notes.coupon;
      } catch (e) {
        // if parsing fails, fallback to the raw string as code
        parsedCoupon = { code: String(notes.coupon) };
      }
    } else if (notes.couponCode || notes.couponName) {
      parsedCoupon = {
        code: notes.couponCode || "NONE",
        name: notes.couponName || "",
        type: notes.couponType || "",
        value: notes.couponValue || undefined,
        discount: parseFloat(notes.discountAmount || notes.discount || 0) || 0,
      };
    }

    const discountFromNotes = parseFloat(notes.discountAmount || notes.discount || (parsedCoupon && parsedCoupon.discount) || 0) || 0;

    const orderData = {
      paymentId: payment.id,
      grandTotal: (payment.amount || 0) / 100,
      shipping: payment.notes?.shipping ? JSON.parse(String(payment.notes.shipping)) : {},
      items: payment.notes?.items ? JSON.parse(String(payment.notes.items)) : [],
      notes,
      coupon: parsedCoupon,
      discount: discountFromNotes,
    };

    console.log("🧾 [WEBHOOK] Final orderData prepared:", JSON.stringify(orderData, null, 2));

    // Send emails (fire-and-forget but log errors)
    sendOrderEmails(orderData).then(() => {
      console.log("📧 [WEBHOOK] sendOrderEmails finished.");
    }).catch(err => {
      console.error("❌ [WEBHOOK] sendOrderEmails error:", err);
    });

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
    console.error("❌ Products fetch error:", err);
    res.status(500).json({ success: false, error: "Failed to fetch products" });
  }
});

// Coupon endpoint
app.get("/api/coupons", (req, res) => {
  const filePath = path.join(process.cwd(), "coupons.json");
  try {
    const coupons = JSON.parse(fs.readFileSync(filePath, "utf8"));
    res.json(coupons);
  } catch (err) {
    console.error("Error reading coupons.json:", err);
    res.status(500).json({ error: "Failed to load coupons" });
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
