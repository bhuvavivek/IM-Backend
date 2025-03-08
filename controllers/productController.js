import Product from "../models/Product.js";
// Add Product
const addProduct = async (req, res) => {
  try {
    const { name, price, unit, weight, stock } = req.body;

    console.log(req.body)

    const product = await Product.create({
      name: name?.trim(),
      price,
      unit,
      weight,
      stock,
    });

    res.status(201).json(product);
  } catch (error) {
    console.log(error);

    if (error.code === 11000) {
      return res.status(400).json({
        message: `Product with name "${error.keyValue.name}" already exists.`,
      });
    }

    res.status(500).json({ message: "Error adding product", error });
  }
};

// Update Product
const updateProduct = async (req, res) => {
  try {
    const { name, unit, price, weight, stock } = req.body;

    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      {
        name: name.trim(),
        price,
        unit,
        weight,
        stock,
      },
      { new: true }
    );

    res.json(updatedProduct);
  } catch (error) {
    res.status(500).json({ message: "Error updating product", error });
  }
};

// Delete Product
const deleteProduct = async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.json({ message: "Product deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting product", error });
  }
};

// Get All Products
const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find();
    res.status(200).json({products});
  } catch (error) {
    res.status(500).json({ message: "Error fetching products", error });
  }
};

// Get Single Product
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.params.productId);
    if(!product){
      res.status(404).json({
        message:'Product Not Founde with this id'
      })
    }
    res.status(200).json(product);
  } catch (error) {
    res.status(500).json({ message: "Error fetching product", error });
  }
};
export {
  addProduct,
  deleteProduct,
  getAllProducts,
  getProductById,
  updateProduct,
};
