const fs = require("fs");
const path = require("path");
const Database = require("better-sqlite3");

// Open/create the database
const db = new Database("./products.db");

// ================================
// Create table (if not exists)
// ================================
db.prepare(`
  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    qty REAL NOT NULL,
    image TEXT
  )
`).run();

// ================================
// Read products from JSON
// ================================
const jsonPath = path.join(__dirname, "products.json");

if (!fs.existsSync(jsonPath)) {
  console.error("❌ products.json not found!");
  process.exit(1);
}

let products;
try {
  const rawData = fs.readFileSync(jsonPath, "utf-8");
  products = JSON.parse(rawData);
} catch (err) {
  console.error("❌ Invalid JSON:", err);
  process.exit(1);
}

// ================================
// Insert/update products in DB
// ================================
const insertStmt = db.prepare(`
  INSERT INTO products (name, description, price, qty, image)
  VALUES (?, ?, ?, ?, ?)
`);

const updateStmt = db.prepare(`
  UPDATE products
  SET description = ?, price = ?, qty = ?, image = ?
  WHERE name = ?
`);

for (const p of products) {
  const exists = db.prepare("SELECT id FROM products WHERE name = ?").get(p.name);

  if (!exists) {
    insertStmt.run(p.name, p.description, p.price, p.qty ?? 0, p.image);
    console.log(`✅ Added: ${p.name}`);
  } else {
    updateStmt.run(p.description, p.price, p.qty ?? 0, p.image, p.name);
    console.log(`🔄 Updated: ${p.name}`);
  }
}

// ================================
// Fetch all products to verify
// ================================
const allProducts = db.prepare("SELECT * FROM products").all();
console.log("\n📦 All products in DB:");
console.table(allProducts);
