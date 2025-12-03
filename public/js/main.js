document.addEventListener("DOMContentLoaded", async () => {
  const productsGrid = document.querySelector(".products-grid");
  const cartModalEl = document.getElementById("cartModal");
  const cartModal = new bootstrap.Modal(cartModalEl);
  const cartBody = document.getElementById("cartBody");
  const cartCountSpans = document.querySelectorAll(".cart-count");
  const checkoutBtn = document.getElementById("checkoutBtn");
  let cart = [];

  const dev_mode = window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1";

  // ---------- Helper Functions ----------
  const updateCartCount = () => {
    const count = cart.reduce((sum, i) => sum + i.qty, 0);
    cartCountSpans.forEach(span => span.textContent = count);
  };

  // ============= SNIPPET 1: Add this helper function at the top with other helper functions =============
  // Place this AFTER the "const updateCartCount = () => {" function

  const showCartMessage = (message = "Item added to cart!", duration = 1000) => {
    const cartMsg = document.getElementById("cart-message");
    if (!cartMsg) return;

    cartMsg.textContent = message;
    cartMsg.classList.add("show");
    cartMsg.style.display = "block";

    setTimeout(() => {
      cartMsg.classList.remove("show");
      cartMsg.style.display = "none";
    }, duration);
  };

  const removeFromCart = id => {
    cart = cart.filter(i => i.id !== id);
    updateCartCount();
    renderCart();
  };

  const changeQty = (id, delta) => {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty < 1) removeFromCart(id);
    else { renderCart(); updateCartCount(); }
  };

  function calculateTotals() {
    const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
    const shipping = 0; // subtotal > 400 ? 0 : 80;
    const discount = discountAmount || 0;
    const grandTotal = subtotal + shipping - discount;
    return { subtotal, shipping, discount, grandTotal };
  }


  const renderCart = () => {
    cartBody.innerHTML = '';
    if (!cart.length) {
      cartBody.innerHTML = `<div class="text-center py-5">
        <i class="bi bi-cart-x display-4 text-muted"></i>
        <h4>Your cart is empty</h4>
        <p>Add some products to your cart</p>
      </div>`;
      return;
    }

    const { subtotal, shipping, grandTotal } = calculateTotals();

    cart.forEach(item => {
      const div = document.createElement('div');
      div.innerHTML = `
        <div class="cart-item border rounded-3 p-3 mb-3 bg-white shadow-sm">
          <div class="row align-items-center g-3">
            <div class="col-2 text-center"><img src="${item.img}" alt="${item.name}" class="img-fluid rounded-3 border"></div>
            <div class="col-4"><h6 class="mb-1 fw-semibold text-dark">${item.name}</h6><p class="text-muted small mb-0">₹${item.price}</p></div>
            <div class="col-3 d-flex align-items-center justify-content-center">
              <button class="btn btn-sm btn-outline-secondary quantity-btn decrease rounded-circle" data-id="${item.id}"><i class="bi bi-dash"></i></button>
              <span class="mx-2 fw-semibold">${item.qty}</span>
              <button class="btn btn-sm btn-outline-secondary quantity-btn increase rounded-circle" data-id="${item.id}"><i class="bi bi-plus"></i></button>
            </div>
            <div class="col-2 text-center"><span class="fw-bold text-success">₹${(item.price * item.qty).toFixed(2)}</span></div>
            <div class="col-1 text-end"><button class="btn btn-sm btn-outline-danger remove-item rounded-circle" data-id="${item.id}" title="Remove item"><i class="bi bi-trash"></i></button></div>
          </div>
        </div>`;
      cartBody.appendChild(div);
    });

    cartBody.innerHTML += `
      <div class="summary-box text-end mt-4 p-4 border rounded-3 bg-light shadow-sm">
        <h6 class="text-muted mb-1">Subtotal: <span class="fw-semibold text-dark">₹${subtotal.toFixed(2)}</span></h6>
        <h6 class="text-muted mb-1">Shipping: <span class="fw-semibold text-dark">₹${shipping.toFixed(2)}</span></h6>
        <hr class="my-2">
        <h4 class="fw-bold text-primary mb-0">Total: ₹${grandTotal.toFixed(2)}</h4>
      </div>

      <div class="shipping-info mt-4 p-4 border rounded-3 bg-white shadow-sm">
        <h5 class="mb-3 text-dark"><i class="bi bi-truck me-2 text-primary"></i>Shipping Information</h5>
        <div class="row g-3">
          <div class="col-md-6"><input type="text" class="form-control shipping-name" placeholder="Full Name" required></div>
          <div class="col-md-6"><input type="tel" class="form-control contact-number" placeholder="Contact Number" required maxlength="10"></div>
          <div class="col-md-6"><input type="email" class="form-control shipping-email" placeholder="Email" required></div>
          <div class="col-md-6"><input type="text" class="form-control shipping-pincode" placeholder="PIN Code" required maxlength="6"></div>
          <div class="col-12"><textarea class="form-control shipping-address" placeholder="Full Address with Landmark" rows="2" required></textarea></div>
           <!-- Coupon Section -->
      <div class="px-4 pb-3">
        <div class="input-group">
          <input
            type="text"
            class="form-control rounded-start-pill"
            id="couponCode"
            placeholder="Enter coupon code"
          />
          <button
            class="btn btn-outline-primary rounded-end-pill"
            id="applyCouponBtn"
            type="button"
          >
            Apply
          </button>
        </div>
        <div id="couponMessage" class="form-text mt-1 text-success"></div>
      </div>
          </div>
      </div>`;

    cartBody.querySelectorAll(".increase").forEach(btn => btn.addEventListener("click", () => changeQty(btn.dataset.id, 1)));
    cartBody.querySelectorAll(".decrease").forEach(btn => btn.addEventListener("click", () => changeQty(btn.dataset.id, -1)));
    cartBody.querySelectorAll(".remove-item").forEach(btn => btn.addEventListener("click", () => removeFromCart(btn.dataset.id)));
    initCouponHandler();

  };

  // ---------- Quick View Modal ----------
  function createQuickViewModal() {
    const modal = document.createElement('div');
    modal.className = 'modal fade';
    modal.id = 'quickViewModal';
    modal.tabIndex = '-1';
    modal.innerHTML = `
      <div class="modal-dialog modal-lg">
        <div class="modal-content rounded-4">
          <div class="modal-header border-0 pb-0">
            <h5 class="modal-title">Quick View</h5>
            <button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
          </div>
          <div class="modal-body">
            <div class="row">
              <div class="col-md-6">
                <img id="quickViewImage" src="" alt="Product" class="img-fluid rounded-3">
              </div>
              <div class="col-md-6">
                <h4 id="quickViewTitle" class="fw-bold mb-2"></h4>
                <p id="quickViewDescription" class="text-muted mb-3"></p>
                <h5 id="quickViewPrice" class="text-success fw-bold mb-3"></h5>
                <p id="quickViewStock" class="mb-3"></p>
                <div class="d-flex gap-2">
                  <button id="quickViewAddBtn" class="btn btn-success flex-grow-1"><i class="bi bi-cart-plus me-2"></i>Add to Cart</button>
                  <button class="btn btn-outline-secondary" data-bs-dismiss="modal">Close</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(modal);
    return new bootstrap.Modal(modal);
  }

  const quickViewModal = createQuickViewModal();

  const showQuickView = (product) => {
    document.getElementById('quickViewImage').src = `/${product.image}`;
    document.getElementById('quickViewTitle').textContent = product.name;
    document.getElementById('quickViewDescription').textContent = product.description;
    document.getElementById('quickViewPrice').textContent = `₹${product.price}`;

    const stockText = product.qty === 0
      ? '<span class="text-danger"><i class="bi bi-x-circle me-1"></i>Out of Stock</span>'
      : `<span class="text-success"><i class="bi bi-check-circle me-1"></i>In Stock (${product.qty} available)</span>`;
    document.getElementById('quickViewStock').innerHTML = stockText;

    const addBtn = document.getElementById('quickViewAddBtn');
    addBtn.disabled = product.qty === 0;
    addBtn.onclick = () => {
      const existing = cart.find(i => i.id === product.id);
      if (existing) {
        existing.qty++;
        showCartMessage(`${product.name} quantity updated!`);
      } else {
        cart.push({ id: product.id, name: product.name, price: product.price, img: `/${product.image}`, qty: 1 });
        showCartMessage(`${product.name} added to cart!`);
      }
      updateCartCount();
      renderCart();
      quickViewModal.hide();
    };
    quickViewModal.show();
  };

  // ---------- Fetch Products ----------
  try {
    const res = await fetch("/api/products");
    const data = await res.json();
    if (!data.success) throw new Error("Failed to fetch products");

    productsGrid.innerHTML = "";
    data.products.forEach(product => {
      const div = document.createElement("div");
      div.className = "product-card";
      div.dataset.id = product.id;

      const isOutOfStock = product.qty === 0;
      const buttonHTML = isOutOfStock
        ? `<button class="btn btn-secondary w-100 mt-2" disabled>Out of Stock</button>`
        : `<button class="btn btn-success btn-add-cart w-100 mt-2"><i class="bi bi-cart-plus me-1"></i> Add to Cart</button>`;
      const badgeHTML = isOutOfStock
        ? `<span class="badge bg-danger position-absolute top-0 end-0 m-2">Out of Stock</span>`
        : "";

      div.innerHTML = `<div class="position-relative" style="cursor: pointer;" data-product-id="${product.id}">
        ${badgeHTML}
        <img src="/${product.image}" class="product-img w-100 rounded" alt="${product.name}" loading="lazy" style="cursor: pointer;">
      </div>
        <div class="product-body p-2"><h5 class="product-title">${product.name}</h5><p class="product-description small">${product.description}</p><div class="product-price fw-bold">₹${product.price}</div>${buttonHTML}</div>`;
      productsGrid.appendChild(div);

      // Quick view on image click
      div.querySelector('.product-img').addEventListener('click', () => showQuickView(product));
    });

    // Add to cart
    productsGrid.querySelectorAll(".btn-add-cart").forEach(btn => {
      btn.addEventListener("click", () => {
        const parent = btn.closest(".product-card");
        const id = parent.dataset.id;
        const name = parent.querySelector(".product-title").textContent;
        const price = Number(parent.querySelector(".product-price").textContent.replace("₹", ""));
        const img = parent.querySelector("img").src;
        const existing = cart.find(i => i.id === id);

        // Check if item already exists
        if (existing) {
          existing.qty++;
          showCartMessage(`${name} quantity updated!`);
        } else {
          cart.push({ id, name, price, img, qty: 1 });
          showCartMessage(`${name} added to cart!`);
        }

        updateCartCount();
        renderCart();
      });
    });



  } catch (err) {
    console.error(err);
    productsGrid.innerHTML = "<p class='text-danger'>Failed to load products. Please try again later.</p>";
  }

  // ---------- Cart Modal Open ----------
  document.querySelectorAll(".openCartBtn").forEach(btn => {
    btn.addEventListener("click", () => cartModal.show());
  });

  // ---------- Cart Modal Close RESET ----------
  cartModalEl.addEventListener("hidden.bs.modal", () => {
    // Clear entire cart
    cart = [];

    // Reset applied coupon
    appliedCoupon = null;

    // Reset Counts & Items UI
    updateCartCount();
    renderCart();

    // Reset Summary UI
    updateCartSummary({
      subtotal: 0,
      discount: 0,
      shipping: 0,
      grandTotal: 0
    });
  });



  // ---------- Modern Loading Overlay ----------
  function createLoadingOverlay() {
    const overlay = document.createElement('div');
    overlay.className = 'loading-overlay';
    overlay.innerHTML = `
      <div class="loading-container">
        <div class="spinner-wrapper">
          <div class="animated-spinner">
            <div class="spinner-ring"></div>
            <div class="spinner-ring"></div>
            <div class="spinner-ring"></div>
          </div>
        </div>
        <div class="loading-content">
          <h4 class="loading-title">Processing Your Order</h4>
          <p class="loading-message">Please wait while we prepare your payment...</p>
          <div class="progress-bar-container">
            <div class="progress-bar-fill"></div>
          </div>
          <p class="loading-hint">Do not close this window</p>
        </div>
      </div>
    `;

    const style = document.createElement('style');
    style.textContent = `
      .loading-overlay {
        position: fixed;
        top: 0;
        left: 0;
        width: 100%;
        height: 100%;
        background: rgba(0, 0, 0, 0.6);
        backdrop-filter: blur(4px);
        display: flex;
        align-items: center;
        justify-content: center;
        z-index: 9999;
        animation: fadeIn 0.3s ease-in-out;
      }

      @keyframes fadeIn {
        from {
          opacity: 0;
        }
        to {
          opacity: 1;
        }
      }

      .loading-container {
        background: white;
        border-radius: 20px;
        padding: 40px;
        text-align: center;
        box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
        max-width: 400px;
        animation: slideUp 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
      }

      @keyframes slideUp {
        from {
          transform: translateY(30px);
          opacity: 0;
        }
        to {
          transform: translateY(0);
          opacity: 1;
        }
      }

      .spinner-wrapper {
        margin-bottom: 25px;
      }

      .animated-spinner {
        position: relative;
        width: 80px;
        height: 80px;
        margin: 0 auto;
      }

      .spinner-ring {
        position: absolute;
        width: 100%;
        height: 100%;
        border: 4px solid transparent;
        border-top-color: #198754;
        border-radius: 50%;
        animation: spin 1.5s linear infinite;
      }

      .spinner-ring:nth-child(2) {
        width: 85%;
        height: 85%;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        border-top-color: #20c997;
        animation: spin 1.2s linear infinite reverse;
      }

      .spinner-ring:nth-child(3) {
        width: 70%;
        height: 70%;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        border-top-color: #0dcaf0;
        animation: spin 0.9s linear infinite;
      }

      @keyframes spin {
        0% {
          transform: rotate(0deg);
        }
        100% {
          transform: rotate(360deg);
        }
      }

      .loading-content {
        animation: fadeIn 0.5s ease-in-out 0.2s both;
      }

      .loading-title {
        font-size: 18px;
        font-weight: 600;
        color: #1a1a1a;
        margin: 0 0 10px 0;
      }

      .loading-message {
        font-size: 14px;
        color: #666;
        margin: 0 0 20px 0;
        line-height: 1.5;
      }

      .progress-bar-container {
        width: 100%;
        height: 4px;
        background: #e9ecef;
        border-radius: 10px;
        overflow: hidden;
        margin-bottom: 15px;
      }

      .progress-bar-fill {
        height: 100%;
        background: linear-gradient(90deg, #198754, #20c997, #0dcaf0);
        border-radius: 10px;
        animation: progressFill 2s ease-in-out infinite;
      }

      @keyframes progressFill {
        0% {
          width: 0%;
        }
        50% {
          width: 100%;
        }
        100% {
          width: 0%;
        }
      }

      .loading-hint {
        font-size: 12px;
        color: #999;
        margin: 0;
        font-style: italic;
      }

      @media (max-width: 480px) {
        .loading-container {
          margin: 20px;
          padding: 30px 20px;
        }

        .animated-spinner {
          width: 60px;
          height: 60px;
        }

        .loading-title {
          font-size: 16px;
        }
      }
    `;

    document.head.appendChild(style);
    document.body.appendChild(overlay);
    return overlay;
  }

  function showLoadingOverlay(title = "Processing Your Order", message = "Please wait while we prepare your payment...") {
    let overlay = document.querySelector('.loading-overlay');
    if (!overlay) {
      overlay = createLoadingOverlay();
    }

    overlay.querySelector('.loading-title').textContent = title;
    overlay.querySelector('.loading-message').textContent = message;
    overlay.style.display = 'flex';
    return overlay;
  }

  function hideLoadingOverlay() {
    const overlay = document.querySelector('.loading-overlay');
    if (overlay) {
      overlay.style.animation = 'fadeOut 0.3s ease-in-out';
      setTimeout(() => {
        overlay.style.display = 'none';
        overlay.style.animation = 'fadeIn 0.3s ease-in-out';
      }, 300);
    }
  }

  function updateLoadingMessage(message) {
    const overlay = document.querySelector('.loading-overlay');
    if (overlay) {
      overlay.querySelector('.loading-message').textContent = message;
    }
  }

  //==========================//
  //========coupon logic======//
  //==========================//

  let appliedCoupon = null;
  let discountAmount = 0;

  // 🧠 Initialize Coupon Logic — works even when dynamically injected
  function initCouponHandler() {
    // short delay to ensure DOM elements exist
    setTimeout(() => {
      const couponCodeInput = document.getElementById("couponCode");
      const applyCouponBtn = document.getElementById("applyCouponBtn");
      const couponMessage = document.getElementById("couponMessage");

      // If coupon elements don't exist yet, skip
      if (!couponCodeInput || !applyCouponBtn || !couponMessage) return;

      // Remove previous listeners to prevent duplication
      const newApplyBtn = applyCouponBtn.cloneNode(true);
      applyCouponBtn.parentNode.replaceChild(newApplyBtn, applyCouponBtn);

      // ✅ Add click event
      newApplyBtn.addEventListener("click", async () => {
        const code = couponCodeInput.value.trim().toUpperCase();
        if (!code) {
          couponMessage.classList.replace("text-success", "text-danger");
          couponMessage.textContent = "⚠️ Please enter a coupon code.";
          return;
        }

        try {
          const res = await fetch("/api/coupons");
          if (!res.ok) throw new Error("Failed to load coupons");
          const coupons = await res.json();
          const coupon = coupons.find(c => c.code === code);

          // ❌ Invalid Coupon
          if (!coupon) {
            couponMessage.classList.replace("text-success", "text-danger");
            couponMessage.textContent = "❌ Invalid coupon code.";
            appliedCoupon = null;
            discountAmount = 0;
            updateCartSummary();
            return;
          }

          // ⏳ Check expiry
          if (new Date(coupon.expires) < new Date()) {
            couponMessage.classList.replace("text-success", "text-danger");
            couponMessage.textContent = "⚠️ This coupon has expired.";
            appliedCoupon = null;
            discountAmount = 0;
            updateCartSummary();

            return;
          }

          // 💰 Validate minimum purchase
          const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
          if (subtotal < coupon.minPurchase) {
            couponMessage.classList.replace("text-success", "text-danger");
            couponMessage.textContent = `⚠️ Minimum purchase ₹${coupon.minPurchase} required.`;
            appliedCoupon = null;
            discountAmount = 0;
            updateCartSummary();
            return;
          }

          // 🧮 Calculate discount
          let discount = 0;
          if (coupon.type === "percent") {
            discount = (subtotal * coupon.value) / 100;
            if (discount > coupon.maxDiscount) discount = coupon.maxDiscount;
          } else if (coupon.type === "flat") {
            discount = Math.min(coupon.value, coupon.maxDiscount || coupon.value);
          }

          appliedCoupon = coupon;
          discountAmount = discount;

          // ✅ Success message
          couponMessage.classList.replace("text-danger", "text-success");
          couponMessage.textContent = `${coupon.message} You saved ₹${discountAmount.toFixed(2)}!`;

          updateCartSummary();
          console.log("Applied coupon: ", appliedCoupon);

        } catch (err) {
          console.error("Coupon error:", err);
          couponMessage.classList.replace("text-success", "text-danger");
          couponMessage.textContent = "⚠️ Could not validate coupon.";
        }
      });
    }, 100); // short delay to ensure element is rendered
  }

  // -------------------------
  // 💵 Totals + Cart Summary
  // -------------------------
  function calculateTotals() {
    const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
    const shipping = 0; // subtotal > 400 ? 0 : 80;
    const discount = discountAmount || 0;
    const grandTotal = subtotal + shipping - discount;
    return { subtotal, shipping, discount, grandTotal };
  }

  function updateCartSummary() {
    const { subtotal, shipping, discount, grandTotal } = calculateTotals();

    const summaryHTML = `
    <div class="border-top mt-3 pt-3">
      <p class="d-flex justify-content-between mb-1">
        <span>Subtotal:</span> <strong>₹${subtotal.toFixed(2)}</strong>
      </p>
      <p class="d-flex justify-content-between mb-1">
        <span>Shipping:</span> <strong>${shipping > 0 ? `₹${shipping}` : "Free"}</strong>
      </p>
      ${discount > 0 ? `<p class="d-flex justify-content-between text-success mb-1">
        <span>Discount (${appliedCoupon.code}):</span> <strong>-₹${discount.toFixed(2)}</strong>
      </p>` : ""}
      <hr>
      <p class="d-flex justify-content-between fs-5">
        <span>Total:</span> <strong>₹${grandTotal.toFixed(2)}</strong>
      </p>
    </div>
  `;

    const cartSummary = document.getElementById("cartSummary");
    if (cartSummary) cartSummary.innerHTML = summaryHTML;
  }







  // ---------- Checkout Handler ----------
  checkoutBtn.addEventListener("click", async () => {
    if (checkoutBtn.disabled) return;
    checkoutBtn.disabled = true;

    if (!cart.length) {
      checkoutBtn.disabled = false;
      return alert("Cart is empty");
    }

    // Get form values
    const name = document.querySelector(".shipping-name")?.value.trim() || "";
    const email = document.querySelector(".shipping-email")?.value.trim() || "";
    const address = document.querySelector(".shipping-address")?.value.trim() || "";
    const pincode = document.querySelector(".shipping-pincode")?.value.trim() || "";
    const phone = document.querySelector(".contact-number")?.value.trim() || "";

    // Validate inputs
    if (!name || !email || !address || !phone || !pincode) {
      checkoutBtn.disabled = false;
      return alert("Please fill all shipping details");
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      checkoutBtn.disabled = false;
      return alert("Please enter a valid email address");
    }

    const phoneRegex = /^[6-9]\d{9}$/;
    if (!phoneRegex.test(phone)) {
      checkoutBtn.disabled = false;
      return alert("Please enter a valid 10-digit phone number");
    }

    const pincodeRegex = /^\d{6}$/;
    if (!pincodeRegex.test(pincode)) {
      checkoutBtn.disabled = false;
      return alert("Please enter a valid 6-digit pincode");
    }

    // 🧮 Calculate totals & discount
    const { subtotal, shipping, grandTotal } = calculateTotals();

    let discountAmount = 0;
    if (appliedCoupon) {
      if (appliedCoupon.type === "percent") {
        discountAmount = (subtotal * appliedCoupon.value) / 100;
      } else if (appliedCoupon.type === "flat") {
        discountAmount = appliedCoupon.value;
      }
    }

    // ✅ Ensure discount never exceeds subtotal
    discountAmount = Math.min(discountAmount, subtotal);
    // ✅ Prepare notes for Razorpay or simulated webhook
    const notes = {
      shipping: JSON.stringify({ name, email, address, phone, pincode }),
      items: JSON.stringify(cart),
      coupon: JSON.stringify({
        code: appliedCoupon?.code || "NONE",
        name: appliedCoupon?.name || "",
        type: appliedCoupon?.type || "",
        value: appliedCoupon?.value || 0,
        discount: discountAmount || 0
      }),
      discountAmount: discountAmount.toString()
    };

    console.log("🟢 Checkout notes ready:", notes);
    console.log("🟢 Checkout initiated with:", {
      subtotal,
      shipping,
      grandTotal,
      appliedCoupon,
      discountAmount,
      notes,
    });

    try {
      if (dev_mode) {
        // ---------- DEVELOPMENT MODE ----------
        showLoadingOverlay("Simulating Payment", "Testing payment process...");

        const simulatedPaymentId = "DEV-" + Date.now();
        console.log("🧪 Dev mode: simulating payment", simulatedPaymentId);

        updateLoadingMessage("Sending order emails...");

        const webhookRes = await fetch(`http://localhost:3000/razorpay-webhook`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-razorpay-signature": "dev-mode-simulated",
          },
          body: JSON.stringify({
            payload: {
              payment: {
                entity: {
                  id: simulatedPaymentId,
                  amount: grandTotal * 100,
                  notes,
                },
              },
            },
          }),
        });

        const webhookData = await webhookRes.json();
        console.log("Webhook response:", webhookData);

        window.location.href = `/thankyou.html?pid=${simulatedPaymentId}`;
      } else {
        // ---------- PRODUCTION MODE ----------
        showLoadingOverlay("Processing Payment", "Preparing your transaction...");

        const API_URL =
          window.location.hostname === "localhost"
            ? "http://localhost:3000"
            : "https://www.thelocalbasket.in";

        // ✅ Create Razorpay order
        const orderRes = await fetch(`${API_URL}/create-razorpay-order`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            amount: grandTotal,
            currency: "INR",
            notes,
          }),
        });

        if (!orderRes.ok) {
          throw new Error(`Server error: ${orderRes.status}`);
        }

        const orderData = await orderRes.json();

        if (!orderData.success || !orderData.order?.id) {
          throw new Error(orderData.error || "Failed to create payment order");
        }

        // 🧾 Razorpay Options
        const options = {
          key: orderData.order.key_id,
          amount: orderData.order.amount,
          currency: orderData.order.currency,
          name: "The Local Basket",
          description: "Order Payment",
          order_id: orderData.order.id,
          prefill: { name, email, contact: phone },
          notes,
          theme: { color: "#198754" },
          handler: function (response) {
            //console.log("💰 Payment successful:", response.razorpay_payment_id);
            window.location.href = `/thankyou.html?pid=${response.razorpay_payment_id}`;
          },
          modal: {
            ondismiss: function () {
              console.log("Payment popup closed");
              checkoutBtn.disabled = false;
              hideLoadingOverlay();
            },
          },
        };

        const rzp = new Razorpay(options);

        rzp.on("payment.failed", function (response) {
          console.error("❌ Payment failed:", response.error);
          hideLoadingOverlay();
          alert("Payment failed: " + response.error.description);
          checkoutBtn.disabled = false;
        });

        rzp.open();
      }
    } catch (err) {
      console.error("Checkout error:", err);
      hideLoadingOverlay();
      alert("Error: " + err.message);
      checkoutBtn.disabled = false;
    }
  });

});