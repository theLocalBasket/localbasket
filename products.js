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
    image TEXT
  )
`).run();

// ================================
// Read products from JSON
// ================================
const jsonPath = path.join(__dirname, "products.json");

if (!fs.existsSync(jsonPath)) {
  console.error("products.json not found!");
  process.exit(1);
}

const rawData = fs.readFileSync(jsonPath, "utf-8");
let products;

try {
  products = JSON.parse(rawData);
} catch (err) {
  console.error("Invalid JSON:", err);
  process.exit(1);
}

// ================================
// Insert/update products in DB
// ================================
const insertStmt = db.prepare(`
  INSERT INTO products (name, description, price, image)
  VALUES (?, ?, ?, ?)
`);

// Loop through products
for (const p of products) {
  // Check if product already exists by name
  const exists = db.prepare("SELECT * FROM products WHERE name = ?").get(p.name);

  if (!exists) {
    insertStmt.run(p.name, p.description, p.price, p.image);
    console.log(`✅ Added: ${p.name}`);
  } else {
    console.log(`ℹ️  Exists: ${p.name}`);
  }
}

// ================================
// Fetch all products to verify
// ================================
const allProducts = db.prepare("SELECT * FROM products").all();
console.log("\nAll products in DB:");
console.table(allProducts);
