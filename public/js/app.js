/* =========================================
   GLOBAL STATE
========================================= */
let cart = [];
let appliedCoupon = null;
let discountAmount = 0;

/* =========================================
   UTILITIES
========================================= */
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

/* =========================================
   CART COUNT BADGE
========================================= */
function updateCartCount() {
  const count = cart.reduce((sum, item) => sum + item.qty, 0);
  $(".cart-count").textContent = count;
}

/* =========================================
   CART TOTAL CALCULATION
========================================= */
function calculateTotals() {
  let subtotal = cart.reduce((sum, item) => sum + item.price * item.qty, 0);
  let discount = appliedCoupon ? discountAmount : 0;
  let shipping = cart.length > 0 ? 0 : 0; // Free shipping
  let grandTotal = subtotal - discount + shipping;

  return { subtotal, shipping, discount, grandTotal };
}

/* =========================================
   UPDATE CART SUMMARY
========================================= */
function updateCartSummary() {
  const { subtotal, shipping, discount, grandTotal } = calculateTotals();

  $("#cartSummary").innerHTML = `
    <div class="border-top mt-3 pt-3">
      <p class="d-flex justify-content-between mb-1">
        <span>Subtotal:</span> <strong>₹${subtotal.toFixed(2)}</strong>
      </p>
      <p class="d-flex justify-content-between mb-1">
        <span>Shipping:</span> <strong>${shipping === 0 ? "Free" : "₹" + shipping}</strong>
      </p>

      ${
        appliedCoupon
          ? `<p class="d-flex justify-content-between text-success mb-1">
               <span>Discount (${appliedCoupon}):</span>
               <strong>-₹${discount.toFixed(2)}</strong>
             </p>`
          : ""
      }

      <hr>
      <p class="d-flex justify-content-between fs-5">
        <span>Total:</span> <strong>₹${grandTotal.toFixed(2)}</strong>
      </p>
    </div>
  `;
}

/* =========================================
   RENDER CART ITEMS
========================================= */
function renderCart() {
  const cartBody = $("#cartBody");

  if (cart.length === 0) {
    cartBody.innerHTML = `
      <div class="text-center py-5">
        <i class="bi bi-cart-x fs-1 mb-3"></i>
        <h5>Your cart is empty</h5>
        <p class="text-muted">Add some products to your cart</p>
      </div>
    `;
    $("#checkoutBtn").disabled = true;
    updateCartSummary();
    return;
  }

  $("#checkoutBtn").disabled = false;

  cartBody.innerHTML = cart
    .map(
      (item, index) => `
        <div class="d-flex justify-content-between align-items-center border-bottom pb-3 mb-3 cart-item fade-in">
          <div>
            <h6 class="mb-1">${item.name}</h6>
            <p class="mb-1 text-muted">₹${item.price}</p>
          </div>

          <div class="d-flex align-items-center gap-3">
            <button class="btn btn-sm btn-outline-secondary" onclick="updateQty(${index}, -1)">−</button>
            <strong>${item.qty}</strong>
            <button class="btn btn-sm btn-outline-secondary" onclick="updateQty(${index}, 1)">+</button>
          </div>

          <button class="btn btn-sm btn-danger" onclick="removeItem(${index})">
            <i class="bi bi-trash"></i>
          </button>
        </div>
      `
    )
    .join("");

  updateCartSummary();
}

/* =========================================
   UPDATE CART QTY / REMOVE
========================================= */
function updateQty(index, change) {
  cart[index].qty += change;
  if (cart[index].qty <= 0) cart.splice(index, 1);

  updateCartCount();
  renderCart();
}

function removeItem(index) {
  cart.splice(index, 1);
  updateCartCount();
  renderCart();
}

/* =========================================
   ADD TO CART
========================================= */
function addToCart(product) {
  const ex = cart.find((item) => item.id === product.id);

  if (ex) {
    ex.qty++;
  } else {
    cart.push({ ...product, qty: 1 });
  }

  updateCartCount();
  renderCart();

  // Smooth toast animation
  const msg = $("#cart-message");
  msg.classList.add("show");
  setTimeout(() => msg.classList.remove("show"), 900);
}

/* =========================================
   RESET CART ON MODAL CLOSE
========================================= */
$("#cartModal").addEventListener("hidden.bs.modal", () => {
  cart = [];
  appliedCoupon = null;
  discountAmount = 0;

  updateCartCount();
  renderCart();
});

/* =========================================
   OPTIONAL — COUPON
========================================= */
function applyCoupon(code) {
  const subtotal = cart.reduce((s, i) => s + i.price * i.qty, 0);

  if (code === "XMAS25") {
    appliedCoupon = code;
    discountAmount = subtotal * 0.20;
  } else {
    appliedCoupon = null;
    discountAmount = 0;
  }

  updateCartSummary();
}

/* =========================================
   SEARCH FILTER
========================================= */
function filterProducts(text) {
  const term = text.toLowerCase().trim();
  const cards = $$(".product-card");
  const grid = $(".products-grid");
  const noResults = $("#noResults");

  let shown = 0;

  cards.forEach((card) => {
    const title = card.querySelector(".product-title")?.textContent.toLowerCase() || "";
    const desc = card.querySelector(".product-desc")?.textContent.toLowerCase() || "";
    const price = card.querySelector(".product-price")?.textContent.toLowerCase() || "";

    const match = title.includes(term) || desc.includes(term) || price.includes(term);

    card.style.display = match ? "block" : "none";
    if (match) shown++;
  });

  noResults.style.display = shown === 0 ? "block" : "none";
  grid.style.display = shown === 0 ? "none" : "grid";
}

function showAllProducts() {
  $$(".product-card").forEach((c) => (c.style.display = "block"));
  $(".products-grid").style.display = "grid";
  $("#noResults").style.display = "none";
}

/* =========================================
   MUTATION OBSERVER (for dynamic items)
========================================= */
const productsGrid = $(".products-grid");

if (productsGrid) {
  new MutationObserver(() => {
    const val = $("#searchInput").value.toLowerCase().trim();
    if (val !== "") filterProducts(val);
  }).observe(productsGrid, { childList: true });
}

/* =========================================
   FOOTER NAVIGATION
========================================= */
function initFooterNavigation() {
  $("#scrollToTop")?.addEventListener("click", (e) => {
    e.preventDefault();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  $("#newArrivals")?.addEventListener("click", (e) => {
    e.preventDefault();
    alert("🛍️ New Arrivals - Coming Soon!");
  });

  $("#offers")?.addEventListener("click", (e) => {
    e.preventDefault();
    alert("🎁 Exciting Offers - Coming Soon!");
  });
}

/* =========================================
   DOM READY
========================================= */
document.addEventListener("DOMContentLoaded", () => {
  const searchInput = $("#searchInput");

  if (searchInput) {
    searchInput.addEventListener("input", (e) => filterProducts(e.target.value));
    searchInput.addEventListener("focus", () => {
      if (searchInput.value === "") showAllProducts();
    });
  }

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (searchInput.value !== "") {
        searchInput.value = "";
        showAllProducts();
      }
    }
  });

  initFooterNavigation();
});
