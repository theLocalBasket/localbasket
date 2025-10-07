document.addEventListener("DOMContentLoaded", async () => {
  const productsGrid = document.querySelector(".products-grid");
  const cartModalEl = document.getElementById("cartModal");
  const cartModal = new bootstrap.Modal(cartModalEl);
  const cartBody = document.getElementById("cartBody");
  const cartCountSpans = document.querySelectorAll(".cart-count");
  const checkoutBtn = document.getElementById("checkoutBtn");
  let cart = [];

  // ---------- Helper Functions ----------
  function updateCartCount() {
    const count = cart.reduce((sum, i) => sum + i.qty, 0);
    cartCountSpans.forEach(span => (span.textContent = count));
  }

  function removeFromCart(id) {
    cart = cart.filter(i => i.id !== id);
    updateCartCount();
    renderCart();
  }

  function changeQty(id, delta) {
    const item = cart.find(i => i.id === id);
    if (!item) return;
    item.qty += delta;
    if (item.qty < 1) removeFromCart(id);
    else {
      renderCart();
      updateCartCount();
    }
  }

  function calculateTotals() {
    const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
    const shipping = subtotal >= 400 ? 0 : 80;
    return { subtotal, shipping, grandTotal: subtotal + shipping };
  }

  function renderCart() {
    cartBody.innerHTML = "";
    if (cart.length === 0) {
      cartBody.innerHTML = `
        <div class="text-center py-5">
          <i class="bi bi-cart-x display-4 text-muted"></i>
          <h4>Your cart is empty</h4>
          <p>Add some products to your cart</p>
        </div>`;
      return;
    }

    const { subtotal, shipping, grandTotal } = calculateTotals();

    cart.forEach(item => {
      const div = document.createElement("div");
      div.className = "cart-item border-bottom py-2";
      div.innerHTML = `
        <div class="row align-items-center">
          <div class="col-2"><img src="${item.img}" alt="${item.name}" class="img-fluid rounded"></div>
          <div class="col-4"><strong>${item.name}</strong><p class="text-muted small">₹${item.price}</p></div>
          <div class="col-3 d-flex align-items-center">
            <button class="btn btn-sm btn-outline-secondary quantity-btn decrease" data-id="${item.id}">-</button>
            <span class="mx-2">${item.qty}</span>
            <button class="btn btn-sm btn-outline-secondary quantity-btn increase" data-id="${item.id}">+</button>
          </div>
          <div class="col-2"><strong>₹${item.price * item.qty}</strong></div>
          <div class="col-1 text-end">
            <button class="btn btn-sm btn-danger remove-item" data-id="${item.id}"><i class="bi bi-trash"></i></button>
          </div>
        </div>`;
      cartBody.appendChild(div);
    });

    cartBody.innerHTML += `
      <div class="text-end mt-3">
        <h5>Subtotal: ₹${subtotal}</h5>
        <h5>Shipping: ₹${shipping}</h5>
        <h4>Total: ₹${grandTotal}</h4>
      </div>
      <div class="mt-4">
        <h5><i class="bi bi-truck me-2"></i>Shipping Information</h5>
        <div class="mb-3"><input type="text" class="form-control shipping-name" placeholder="Full Name" required></div>
        <div class="mb-3"><input type="email" class="form-control shipping-email" placeholder="Email" required></div>
        <div class="mb-3"><textarea class="form-control shipping-address" placeholder="Full Address with PIN" rows="2" required></textarea></div>
        <div class="mb-3"><input type="tel" class="form-control contact-number" placeholder="Contact Number" required maxlength="10"></div>
      </div>`;

    // Event listeners
    cartBody.querySelectorAll(".increase").forEach(btn => btn.addEventListener("click", () => changeQty(btn.dataset.id, 1)));
    cartBody.querySelectorAll(".decrease").forEach(btn => btn.addEventListener("click", () => changeQty(btn.dataset.id, -1)));
    cartBody.querySelectorAll(".remove-item").forEach(btn => btn.addEventListener("click", () => removeFromCart(btn.dataset.id)));
  }

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
      div.innerHTML = `
        <img src="images/placeholder.jpg" data-src="${product.image}" class="product-img w-100 rounded" alt="${product.name}" loading="lazy">
        <div class="product-body p-2">
            <h5 class="product-title">${product.name}</h5>
            <p class="product-description small">${product.description}</p>
            <div class="product-price fw-bold">₹${product.price}</div>
            <button class="btn btn-success btn-add-cart w-100 mt-2">
              <i class="bi bi-cart-plus me-1"></i> Add to Cart
            </button>
        </div>`;
      productsGrid.appendChild(div);
    });

    // Lazy load
    const lazyImages = document.querySelectorAll("img[data-src]");
    const observer = new IntersectionObserver(entries => {
      entries.forEach(entry => {
        if (entry.isIntersecting) {
          const img = entry.target;
          img.src = img.dataset.src;
          img.removeAttribute("data-src");
          observer.unobserve(img);
        }
      });
    });
    lazyImages.forEach(img => observer.observe(img));

    // Image Modal
    productsGrid.querySelectorAll(".product-img").forEach(img => {
      img.addEventListener("click", () => {
        const imageModal = new bootstrap.Modal(document.getElementById("imageModal"));
        const modalImage = document.getElementById("modalImage");
        modalImage.src = img.src;
        modalImage.alt = img.alt;
        imageModal.show();
      });
    });

    // Search
    const searchInput = document.getElementById("searchInput");
    searchInput.addEventListener("input", () => {
      const query = searchInput.value.toLowerCase();
      document.querySelectorAll(".product-card").forEach(card => {
        const title = card.querySelector(".product-title").textContent.toLowerCase();
        const desc = card.querySelector(".product-description")?.textContent.toLowerCase() || "";
        card.style.display = title.includes(query) || desc.includes(query) ? "flex" : "none";
      });
    });

    // Add to Cart
    productsGrid.querySelectorAll(".btn-add-cart").forEach(btn => {
      btn.addEventListener("click", () => {
        const parent = btn.closest(".product-card");
        const id = parent.dataset.id;
        const name = parent.querySelector(".product-title").textContent;
        const price = Number(parent.querySelector(".product-price").textContent.replace("₹", ""));
        const img = parent.querySelector("img").src;

        const existing = cart.find(i => i.id === id);
        if (existing) existing.qty++;
        else cart.push({ id, name, price, img, qty: 1 });

        updateCartCount();
        renderCart();
        cartModal.show();
      });
    });
  } catch (err) {
    console.error(err);
    productsGrid.innerHTML = "<p class='text-danger'>Failed to load products. Please try again later.</p>";
  }

  // ---------- Open Cart ----------
  document.querySelectorAll(".openCartBtn").forEach(btn => btn.addEventListener("click", () => cartModal.show()));

  // ---------- Checkout ----------
  checkoutBtn.addEventListener("click", async () => {
    if (cart.length === 0) return alert("Cart is empty");

    const name = document.querySelector(".shipping-name").value;
    const email = document.querySelector(".shipping-email").value;
    const address = document.querySelector(".shipping-address").value;
    const phone = document.querySelector(".contact-number").value;

    if (!name || !email || !address || !phone) return alert("Please fill all shipping details");

    const { subtotal, shipping, grandTotal } = calculateTotals();

    try {
      const orderRes = await fetch("/create-razorpay-order", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: grandTotal, currency: "INR" })
      });
      const orderData = await orderRes.json();
      if (!orderData.success) return alert("Failed to create payment order");

      const options = {
        key: orderData.order.key_id,
        amount: orderData.order.amount,
        currency: orderData.order.currency,
        name: "The Local Basket",
        description: "Order Payment",
        order_id: orderData.order.id,
        handler: async function (response) {
          // Redirect to processing page instead of overlay
          sessionStorage.setItem(
            "orderDetails",
            JSON.stringify({
              items: cart,
              shipping: { name, email, address, phone },
              paymentId: response.razorpay_payment_id,
              grandTotal
            })
          );

          cart = [];
          updateCartCount();
          renderCart();

          cartModal.hide();
          window.location.href = "/processing.html";
        },
        prefill: { name, email, contact: phone },
        theme: { color: "#198754" }
      };

      const rzp = new Razorpay(options);
      rzp.open();
    } catch (err) {
      console.error(err);
      alert("Error initiating payment");
    }
  });
});
