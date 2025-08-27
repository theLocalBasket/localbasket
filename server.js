const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const app = express();
const PORT = process.env.PORT || 3000;
require('dotenv').config();


// Security middleware
app.disable('x-powered-by');

// Rate limiting configuration
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per window
  standardHeaders: true,
  legacyHeaders: false,
  message: 'Too many requests, please try again later.'
});

// Middleware
app.use(cors);
app.use(bodyParser.json({ limit: '10kb' }));
app.use(express.static('public', { 
  maxAge: '1d',
  setHeaders: (res, path) => {
    if (path.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache, no-store');
    }
  }
}));


app.use(helmet.contentSecurityPolicy({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "https://cdn.jsdelivr.net", "'unsafe-inline'"],
    styleSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.googleapis.com", "'unsafe-inline'"],
    imgSrc: ["'self'", "data:", "https:"],
    fontSrc: ["'self'", "https://cdn.jsdelivr.net", "https://fonts.gstatic.com"],
    connectSrc: ["'self'", "https://your-api-domain.com"],
    objectSrc: ["'none'"]
  }
}));


// Apply rate limiting to API routes
app.use('/send-query', apiLimiter);




// Nodemailer transporter with improved configuration
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS
  },
  pool: true,
  maxConnections: 5,
  maxMessages: 100,
  rateDelta: 60000, // 1 minute interval
  rateLimit: 10 // Max 10 emails per minute
});

// Sanitization function
function sanitize(str) {
  if (!str) return '';
  return str.replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Contact form email template
const createEmailTemplate = (data) => `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
    <div style="background: #1a3c6c; padding: 20px; color: white;">
      <h2 style="margin: 0;">New Website Query</h2>
    </div>
    <div style="padding: 25px; background: #f8f9fc;">
      <table style="width: 100%; border-collapse: collapse;">
        
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; font-weight: bold;">Email</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;">
            <a href="mailto:${data.email}">${data.email}</a>
          </td>
        </tr>
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; font-weight: bold; width: 30%;">Name</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;">${data.name}</td>
        </tr>
       
        ${data.phone ? `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee; font-weight: bold;">Phone</td>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;">
            <a href="tel:${data.phone}">${data.phone}</a>
          </td>
        </tr>
        ` : ''}
        <tr>
          <td style="padding: 10px 0; font-weight: bold;">Subject</td>
          <td style="padding: 10px 0;">${data.subject}</td>
        </tr>
      </table>
      <div style="margin-top: 25px; padding: 15px; background: white; border-radius: 6px; border: 1px solid #e0e0e0;">
        <h3 style="margin-top: 0; color: #1a3c6c;">Message</h3>
        <p style="line-height: 1.6; white-space: pre-wrap;">${data.message}</p>
      </div>
    </div>
    <div style="text-align: center; padding: 15px; background: #f0f2f5; color: #6c757d; font-size: 0.9em;">
      Sent from website contact form • ${new Date().toLocaleString()}
    </div>
  </div>
`;

// Order processing endpoint
app.post('/send-order', async (req, res) => {
  try {
    const orderData = req.body;

    // Validate order data
    if (!orderData.items || orderData.items.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: 'No items in order' 
      });
    }

    // Sanitize order data
    const sanitizedOrder = {
      ...orderData,
      shipping: {
        email: sanitize(orderData.shipping.email),
        name: sanitize(orderData.shipping.name),
        address: sanitize(orderData.shipping.address),
        phone: sanitize(orderData.shipping.phone)
      },
      items: orderData.items.map(item => ({
        id: item.id,
        img: item.img,  // Don't sanitize URLs
        name: sanitize(item.name),
        price: item.price,
        qty: item.qty
      })),
      subtotal: orderData.subtotal,
      shippingCost: orderData.shippingCost,
      grandTotal: orderData.grandTotal
    };

    // Create email template
    const emailHtml = createOrderEmailTemplate(sanitizedOrder);
    const textVersion = createOrderTextTemplate(sanitizedOrder);

    // Send email
    const mailOptions = {
      from: `"New Order Notification" <${process.env.EMAIL_USER}>`,
      to: process.env.RECEIVER_EMAIL,
      subject: `New Order Received - ₹${sanitizedOrder.grandTotal.toLocaleString()}`,
      replyTo: process.env.EMAIL_USER,
      html: emailHtml,
      text: textVersion
    };

    const info = await transporter.sendMail(mailOptions);
    console.log(`📬 Order email sent to admin: ${info.messageId}`);

// Now send confirmation email to customer
const customerMailOptions = {
  from: `"${process.env.STORE_NAME || 'Support Team'}" <${process.env.EMAIL_USER}>`,
  to: sanitizedOrder.shipping.email,
  subject: `Your Order Confirmation - ₹${sanitizedOrder.grandTotal.toLocaleString()}`,
  html: `
  <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto; background-color: #ffffff; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden;">
    <div style="background: linear-gradient(135deg, #1a3c6c 0%, #2a5298 100%); padding: 20px; color: #ffffff; text-align: center;">
      <h1 style="margin: 0;">Thank You for Your Order!</h1>
      <p style="margin: 5px 0 0;">Hi ${sanitizedOrder.shipping.name}, we're preparing your order.</p>
    </div>

    <div style="padding: 25px;">
      <p style="font-size: 16px; color: #333333;">
        We’ve received your order and it’s currently being processed. You’ll receive another email once it ships.
      </p>

      <h2 style="font-size: 18px; color: #1a3c6c; border-bottom: 1px solid #ccc; padding-bottom: 5px;">Order Summary</h2>

      <table style="width: 100%; border-collapse: collapse; margin-top: 15px;">
        <thead>
          <tr style="background-color: #f4f6f9;">
            <th align="left" style="padding: 10px; font-size: 14px;">Product</th>
            <th align="center" style="padding: 10px; font-size: 14px;">Qty</th>
            <th align="right" style="padding: 10px; font-size: 14px;">Price</th>
          </tr>
        </thead>
        <tbody>
          ${sanitizedOrder.items.map(item => `
            <tr style="border-bottom: 1px solid #eee;">
              <td style="padding: 10px;">${item.name}</td>
              <td align="center" style="padding: 10px;">${item.qty}</td>
              <td align="right" style="padding: 10px;">₹${(item.price * item.qty).toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div style="margin-top: 20px; text-align: right;">
        <p style="font-size: 16px; margin: 5px 0;"><strong>Subtotal:</strong> ₹${sanitizedOrder.subtotal.toLocaleString()}</p>
        <p style="font-size: 16px; margin: 5px 0;"><strong>Shipping:</strong> ₹${sanitizedOrder.shippingCost.toLocaleString()}</p>
        <p style="font-size: 18px; margin: 10px 0 0; font-weight: bold; color: #1a3c6c;">Grand Total: ₹${sanitizedOrder.grandTotal.toLocaleString()}</p>
      </div>

      <p style="margin-top: 30px; font-size: 14px; color: #666;">
        If you have any questions about your order, feel free to reply to this email. We're here to help!
      </p>
    </div>

    <div style="background-color: #f0f2f5; padding: 15px; text-align: center; font-size: 12px; color: #888;">
      © ${new Date().getFullYear()} ${process.env.STORE_NAME || 'Your Company'} • All rights reserved
    </div>
  </div>
`,

  text: `Thanks for your order, ${sanitizedOrder.shipping.name}!\n\nItems:\n${sanitizedOrder.items.map(item => `- ${item.name} x ${item.qty} = ₹${item.price * item.qty}`).join('\n')}\n\nTotal: ₹${sanitizedOrder.grandTotal}\n\nWe'll contact you if we need more details.`
};

const customerInfo = await transporter.sendMail(customerMailOptions);
console.log(`📩 Confirmation email sent to customer: ${customerInfo.messageId}`);

res.status(200).json({ 
  success: true, 
  message: 'Order received successfully!',
  messageId: info.messageId,
  confirmationMessageId: customerInfo.messageId
});


  } catch (error) {
    console.error('❌ Error processing order:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Error processing order',
      details: error.message 
    });
  }
});

// Order email template function
function createOrderEmailTemplate(order) {
  // Format items table
  const itemsHtml = order.items.map(item => `
    <tr>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">
        <img src="${item.img}" alt="${item.name}" style="width: 60px; height: 60px; object-fit: cover; border-radius: 6px;">
      </td>
      <td style="padding: 10px; border-bottom: 1px solid #eee;">${item.name}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">₹${item.price.toLocaleString()}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: center;">${item.qty}</td>
      <td style="padding: 10px; border-bottom: 1px solid #eee; text-align: right;">₹${(item.price * item.qty).toLocaleString()}</td>
    </tr>
  `).join('');

  return `
  <div style="font-family: Arial, sans-serif; max-width: 700px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 10px; overflow: hidden;">
    <div style="background: linear-gradient(135deg, #1a3c6c 0%, #2a5298 100%); padding: 25px; color: white;">
      <h1 style="margin: 0; font-size: 28px;">New Order Received!</h1>
      <p style="margin: 5px 0 0; opacity: 0.9;">Order Time: ${new Date().toLocaleString()}</p>
    </div>
    
    <div style="padding: 30px; background: #f8f9fc;">
      <div style="background: white; border-radius: 8px; padding: 20px; margin-bottom: 25px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
        <h2 style="color: #1a3c6c; margin-top: 0;">Shipping Information</h2>
        <p style="margin: 5px 0 0; opacity: 0.9;">Order #: ${new Date().toLocaleString('en-IN', {day:'2-digit',month:'2-digit',year:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).replace(/[\/,:]/g, '').replace(/(\d{6})(\d{6})/, '$1-$2')}</p>

        <table style="width: 100%;">
          <tr>
            <td style="width: 30%; padding: 8px 0; font-weight: bold;">Email:</td>
            <td style="padding: 8px 0;">${order.shipping.email}</td>
          </tr>
          <tr>
            <td style="width: 30%; padding: 8px 0; font-weight: bold;">Name:</td>
            <td style="padding: 8px 0;">${order.shipping.name}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Address:</td>
            <td style="padding: 8px 0;">${order.shipping.address}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; font-weight: bold;">Contact:</td>
            <td style="padding: 8px 0;">${order.shipping.phone}</td>
          </tr>
        </table>
      </div>
      
      <div style="background: white; border-radius: 8px; padding: 20px; box-shadow: 0 2px 10px rgba(0,0,0,0.05);">
        <h2 style="color: #1a3c6c; margin-top: 0;">Order Summary</h2>
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="background: #f0f4f9;">
              <th style="padding: 12px 10px; text-align: left;">Image</th>
              <th style="padding: 12px 10px; text-align: left;">Product</th>
              <th style="padding: 12px 10px; text-align: center;">Price</th>
              <th style="padding: 12px 10px; text-align: center;">Qty</th>
              <th style="padding: 12px 10px; text-align: right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
        
        <div style="margin-top: 30px; text-align: right;">
          <div style="display: inline-block; width: 300px;">
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
              <span style="font-weight: bold;">Subtotal:</span>
              <span>₹${order.subtotal.toLocaleString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between; margin-bottom: 10px; padding-bottom: 10px; border-bottom: 1px solid #eee;">
              <span style="font-weight: bold;">Shipping:</span>
              <span>₹${order.shippingCost.toLocaleString()}</span>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 20px; font-weight: bold; color: #1a3c6c;">
              <span>Grand Total:</span>
              <span>₹${order.grandTotal.toLocaleString()}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <div style="text-align: center; padding: 20px; background: #f0f2f5; color: #6c757d; font-size: 14px;">
      This email was generated automatically. Please do not reply directly to this message.
    </div>
  </div>
  `;
}

// Text version of order email
function createOrderTextTemplate(order) {
  let text = `NEW ORDER RECEIVED\n`;
  text += `===================\n\n`;
  text += `Order Time: ${new Date().toLocaleString()}\n\n`;
  
  text += `SHIPPING INFORMATION\n`;
  text += `--------------------\n`;
  text += `Email: ${order.shipping.email}\n`;
  text += `Name: ${order.shipping.name}\n`;
  text += `Address: ${order.shipping.address}\n`;
  text += `Contact: ${order.shipping.phone}\n\n`;
  
  text += `ORDER SUMMARY\n`;
  text += `-------------\n`;
  
  order.items.forEach(item => {
    text += `- ${item.name} (Qty: ${item.qty}) - ₹${item.price} x ${item.qty} = ₹${(item.price * item.qty)}\n`;
  });
  
  text += `\nSUBTOTAL: ₹${order.subtotal}\n`;
  text += `SHIPPING: ₹${order.shippingCost}\n`;
  text += `GRAND TOTAL: ₹${order.grandTotal}\n\n`;
  
  text += `This email was generated automatically.`;
  
  return text;
}


// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    service: 'Email API',
    version: '1.0.0'
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Resource not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('🔥 Server error:', err.stack);
  res.status(500).json({
    success: false,
    error: 'Internal server error'
  });
});








// Start server
const server = app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
  console.log(`✉️  Email service configured for: ${process.env.EMAIL_USER}`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🛑 Received SIGTERM. Shutting down gracefully...');
  server.close(() => {
    console.log('🔴 Server terminated');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🛑 Received SIGINT. Shutting down...');
  server.close(() => {
    console.log('🔴 Server terminated');
    process.exit(0);
  });
});