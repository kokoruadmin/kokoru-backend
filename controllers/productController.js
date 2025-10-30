// controllers/productController.js
const Product = require("../models/product");

// 🧩 Helper to normalize colors + sizes input
function normalizeColors(inputColors = []) {
  return inputColors.map((c) => {
    const sizes =
      (c.sizes || []).map((s) => ({
        label: typeof s.label === "string" ? s.label : String(s),
        stock: Number(s.stock || 0),
      })) || [];

    const images =
      (c.images || c.imageLinks || "")
        .toString()
        .split(/[\n,]+/)
        .map((u) => u.trim())
        .filter(Boolean);

    return {
      name: c.name || "Color",
      hex: c.hex || "#ffffff",
      images,
      sizes,
    };
  });
}

// ➕ Add new product
exports.createProduct = async (req, res) => {
  try {
    const body = req.body || {};
    // normalize if admin sends color/sizes JSON
    if (body.colors) body.colors = normalizeColors(body.colors);
    const productData = { ...body };

// ensure backward compatibility
if (!productData.ourPrice && body.price) productData.ourPrice = body.price;

// auto-calculate mrp if missing
if (productData.ourPrice && productData.discount && !productData.mrp) {
  const factor = 1 - productData.discount / 100;
  if (factor > 0) productData.mrp = Math.round(productData.ourPrice / factor);
}

const product = new Product(productData);

    await product.save();
    res.status(201).json(product);
  } catch (error) {
    console.error("Create product error:", error);
    res.status(500).json({ message: error.message });
  }
};

// 📦 Get all products
exports.getProducts = async (req, res) => {
  try {
    const products = await Product.find()
      .select("-__v") // hides the version field
      .lean();        // makes it return plain JS objects

    res.json(products);
  } catch (err) {
    console.error("Get all products error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// 🔍 Get single product
exports.getProduct = async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    if (!product) return res.status(404).json({ message: "Product not found" });
    res.json(product);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 🗑 Delete product
exports.deleteProduct = async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Product deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✏️ Update existing product (needed for edit in Admin)
exports.updateProduct = async (req, res) => {
  try {
    const body = req.body || {};
    if (body.colors) body.colors = normalizeColors(body.colors);
    const productData = { ...body };

    if (!productData.ourPrice && body.price) productData.ourPrice = body.price;
    if (productData.ourPrice && productData.discount && !productData.mrp) {
      const factor = 1 - productData.discount / 100;
      if (factor > 0) productData.mrp = Math.round(productData.ourPrice / factor);
    }

const updated = await Product.findByIdAndUpdate(id, productData, { new: true });


    if (!updated)
      return res.status(404).json({ message: "Product not found" });

    res.json(updated);
  } catch (error) {
    console.error("Update product error:", error);
    res.status(500).json({ message: error.message });
  }
};
