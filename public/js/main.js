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

  const removeFromCart = id => { cart = cart.filter(i => i.id !== id); updateCartCount(); renderCart(); };
  const changeQty = (id, delta) => {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty < 1) removeFromCart(id);
    else { renderCart(); updateCartCount(); }
  };
  const calculateTotals = () => {
    const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
    const shipping = 0; //subtotal > 400 ? 0 : 80;
    return { subtotal, shipping, grandTotal: subtotal + shipping };
  };

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
      div.className = "cart-item border-bottom py-2";
      div.innerHTML = `
        <div class="cart-item border rounded-3 p-3 mb-3 bg-white shadow-sm hover-shadow transition-all">
          <div class="row align-items-center g-3">
            <div class="col-2 text-center"><img src="${item.img}" alt="${item.name}" class="img-fluid rounded-3 border"></div>
            <div class="col-4"><h6 class="mb-1 fw-semibold text-dark">${item.name}</h6><p class="text-muted small mb-0">₹${item.price}</p></div>
            <div class="col-3 d-flex align-items-center justify-content-center">
              <button class="btn btn-sm btn-outline-secondary quantity-btn decrease rounded-circle" data-id="${item.id}"><i class="bi bi-dash"></i></button>
              <span class="mx-2 fw-semibold">${item.qty}</span>
              <button class="btn btn-sm btn-outline-secondary quantity-btn increase rounded-circle" data-id="${item.id}"><i class="bi bi-plus"></i></button>
            </div>
            <div class="col-2 text-center"><span class="fw-bold text-success">₹${item.price * item.qty}</span></div>
            <div class="col-1 text-end"><button class="btn btn-sm btn-outline-danger remove-item rounded-circle" data-id="${item.id}" title="Remove item"><i class="bi bi-trash"></i></button></div>
          </div>
        </div>`;
      cartBody.appendChild(div);
    });

    cartBody.innerHTML += `
      <div class="summary-box text-end mt-4 p-4 border rounded-3 bg-light shadow-sm">
        <h6 class="text-muted mb-1">Subtotal: <span class="fw-semibold text-dark">₹${subtotal}</span></h6>
        <h6 class="text-muted mb-1">Shipping: <span class="fw-semibold text-dark">₹${shipping}</span></h6>
        <hr class="my-2">
        <h4 class="fw-bold text-primary mb-0">Total: ₹${grandTotal}</h4>
        <p class="text-muted small mt-2 fst-italic">*A ₹80 shipping charge applies if subtotal is ₹400 or less.</p>
      </div>

      <div class="shipping-info mt-4 p-4 border rounded-3 bg-white shadow-sm">
        <h5 class="mb-3 text-dark"><i class="bi bi-truck me-2 text-primary"></i>Shipping Information</h5>
        <div class="row g-3">
          <div class="col-md-6"><input type="text" class="form-control shipping-name" placeholder="Full Name" required></div>
          <div class="col-md-6"><input type="tel" class="form-control contact-number" placeholder="Contact Number" required maxlength="10"></div>
          <div class="col-md-6"><input type="email" class="form-control shipping-email" placeholder="Email" required></div>
          <div class="col-md-6"><input type="text" class="form-control shipping-pincode" placeholder="PIN Code" required maxlength="6"></div>
          <div class="col-12"><textarea class="form-control shipping-address" placeholder="Full Address with Landmark" rows="2" required></textarea></div>
        </div>
      </div>`;

    cartBody.querySelectorAll(".increase").forEach(btn => btn.addEventListener("click", () => changeQty(btn.dataset.id, 1)));
    cartBody.querySelectorAll(".decrease").forEach(btn => btn.addEventListener("click", () => changeQty(btn.dataset.id, -1)));
    cartBody.querySelectorAll(".remove-item").forEach(btn => btn.addEventListener("click", () => removeFromCart(btn.dataset.id)));
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

      div.innerHTML = `<div class="position-relative">${badgeHTML}<img src="images/placeholder.jpg" data-src="${product.image}" class="product-img w-100 rounded" alt="${product.name}" loading="lazy"></div>
        <div class="product-body p-2"><h5 class="product-title">${product.name}</h5><p class="product-description small">${product.description}</p><div class="product-price fw-bold">₹${product.price}</div>${buttonHTML}</div>`;
      productsGrid.appendChild(div);
    });

    // Lazy load images
    const lazyImages = document.querySelectorAll("img[data-src]");
    const imgObserver = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute("data-src");
          imgObserver.unobserve(img);
        }
      });
    });
    lazyImages.forEach(img => imgObserver.observe(img));

    // Image modal
    productsGrid.querySelectorAll(".product-img").forEach(img => {
      img.addEventListener("click", () => {
        const imageModal = new bootstrap.Modal(document.getElementById("imageModal"));
        const modalImage = document.getElementById("modalImage");
        modalImage.src = img.src;
        modalImage.alt = img.alt;
        imageModal.show();
      });
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
        if (existing) existing.qty++; else cart.push({ id, name, price, img, qty: 1 });
        updateCartCount();
        renderCart();
        document.getElementById("cart-message").style.display = "block";
        setTimeout(() => document.getElementById("cart-message").style.display = "none", 2000);
      });
    });

    // Search/filter
    const searchInput = document.getElementById('searchInput');
    searchInput.addEventListener('input', () => {
      const query = searchInput.value.toLowerCase();
      document.querySelectorAll('.product-card').forEach(card => {
        const title = card.querySelector('.product-title').textContent.toLowerCase();
        const desc = card.querySelector('.product-description')?.textContent.toLowerCase() || '';
        card.style.display = title.includes(query) || desc.includes(query) ? 'flex' : 'none';
      });
    });

  } catch (err) {
    console.error(err);
    productsGrid.innerHTML = "<p class='text-danger'>Failed to load products. Please try again later.</p>";
  }

  // ---------- Cart Modal Open ----------
  document.querySelectorAll(".openCartBtn").forEach(btn => btn.addEventListener("click", () => cartModal.show()));
checkoutBtn.addEventListener("click", async () => {
  // Disable the button immediately to prevent double clicks
  checkoutBtn.disabled = true;
const dev_mode = false;

  if (!cart.length) return alert("Cart is empty");

  const name = document.querySelector('.shipping-name').value.trim();
  const email = document.querySelector('.shipping-email').value.trim();
  const address = document.querySelector('.shipping-address').value.trim();
  const pincode = document.querySelector('.shipping-pincode').value.trim();
  const phone = document.querySelector('.contact-number').value.trim();

  if (!name || !email || !address || !phone || !pincode)
    return alert("Fill all shipping details");

  const { subtotal, shipping, grandTotal } = calculateTotals();

  const notes = {
    shipping: JSON.stringify({ name, email, address, phone, pincode }),
    items: JSON.stringify(cart)
  };

  console.log("💻 Dev mode:", dev_mode);
  console.log("🛒 Cart total:", grandTotal);
  console.log("📦 Shipping info:", notes.shipping);

  try {
    if (dev_mode) {
      const simulatedPaymentId = "DEV-" + Date.now();
      console.log("💻 Dev mode: simulating payment:", simulatedPaymentId);

      const webhookRes = await fetch("/razorpay-webhook", {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-razorpay-signature": "dev-mode-simulated" },
        body: JSON.stringify({
          payload: { payment: { entity: { id: simulatedPaymentId, amount: grandTotal * 100, notes } } }
        })
      });

      const webhookData = await webhookRes.json();
      console.log("📧 Dev webhook result:", webhookData);

      cart = [];
      updateCartCount();
      alert("✅ Dev order simulated! Check console for email logs.");
      return window.location.href = `/thankyou.html?pid=${simulatedPaymentId}`;
    } else {
      const orderRes = await fetch('/create-razorpay-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: grandTotal, currency: "INR", notes })
      });

      const orderData = await orderRes.json();
      if (!orderData.success) return alert("❌ Failed to create payment order");

      const rzp = new Razorpay({
        key: orderData.order.key_id,
        amount: orderData.order.amount,
        currency: orderData.order.currency,
        name: "The Local Basket",
        description: "Order Payment",
        order_id: orderData.order.id,
        prefill: { name, email, contact: phone },
        theme: { color: "#198754" },
        handler: async (response) => {
          console.log("✅ Payment successful:", response.razorpay_payment_id);

          cart = [];
          updateCartCount();
          window.location.href = `/thankyou.html?pid=${response.razorpay_payment_id}`;
        },
        modal: { ondismiss: () => console.log("❌ Payment popup closed") }
      });

      rzp.open();
    }
  } catch (err) {
    console.error("❌ Checkout error:", err);
    alert("Error initiating payment. Check console for details.");
  }
});


  // ---------- Hero Overlay + Shapes + Fade-up ----------
  const heroOverlay = document.querySelector('.hero-overlay');
  if (heroOverlay) heroOverlay.classList.add('visible');

  const hero = document.querySelector('.hero-section');
  [
    { w:150,h:150,b:'#e76f51',t:'10%',l:'5%',d:0 },
    { w:200,h:200,b:'#f4a261',btt:'15%',r:'10%',d:2 },
    { w:100,h:100,b:'#e9c46a',t:'30%',r:'25%',d:4 }
  ].forEach(s=>{
    const span = document.createElement('span');
    span.className='shape';
    span.style.width=s.w+'px';
    span.style.height=s.h+'px';
    span.style.background=s.b;
    if(s.t) span.style.top=s.t;
    if(s.l) span.style.left=s.l;
    if(s.btt) span.style.bottom=s.btt;
    if(s.r) span.style.right=s.r;
    span.style.animationDelay=s.d+'s';
    hero.appendChild(span);
  });

  const observer = new IntersectionObserver(entries=>{
    entries.forEach(e=>{
      if(e.isIntersecting){ e.target.classList.add('visible'); observer.unobserve(e.target); }
    });
  }, { threshold:0.2 });

  document.querySelectorAll('.products-grid .product-card').forEach(c=>{ c.classList.add('fade-up'); observer.observe(c); });

});
