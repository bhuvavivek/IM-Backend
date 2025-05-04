import Product from "../models/Product.js";
import Stock from "../models/Stock.js";

const processedBags = (bags) => {
  const bagsData = bags.map((bag) => ({
    size: bag.size,
    quantity: bag.quantity,
    weight: bag.weight ? bag.weight : bag.size * bag.quantity,
  }));
  return bagsData;
};

const addProduct = async (req, res) => {
  try {
    const {
      name,
      price,
      unit,
      weight,
      stock,
      bags,
      isBesan,
      isRawMaterial,
      isWastage,
      HSNCode,
    } = req.body;

    const processedBagData = processedBags(bags);

    const product = await Product.create({
      name: name?.trim(),
      price,
      stock,
      weight,
      unit,
      bags: processedBagData,
      isBesan,
      isRawMaterial,
      isWastage,
      HSNCode,
    });

    // create a stock here for the product
    if (product) {
      await Stock.create({
        productId: product._id,
        quantity: product.stock,
        lowStockThreshold: 10,
        history: [
          {
            change: product.stock,
            reason: "Initial stock",
            changeType: "STOCK IN",
          },
        ],
      });
    }

    res.status(201).json({
      ...product.toObject(),
      bagssize: product.bagsizes?.[product.bagsizes.length - 1]?.size || 0,
    });
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
    const {
      name,
      unit,
      price,
      weight,
      bags,
      isBesan,
      isRawMaterial,
      isWastage,
      HSNCode,
    } = req.body;

    const product = await Product.findById(req.query.productId);

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    const processedBagData = processedBags(bags);

    const totalweight = weight * product.stock;

    const updatedProduct = await Product.findByIdAndUpdate(
      req.query.productId,
      {
        $set: {
          name: name.trim(),
          price,
          unit,
          weight,
          isBesan,
          isRawMaterial,
          isWastage,
          bags: processedBagData,
          totalWeight: Number(totalweight).toFixed(2),
          HSNCode,
        },
      },
      { new: true }
    );

    res.json({ message: "Product updated", product: updatedProduct });
  } catch (error) {
    res.status(500).json({ message: "Error updating product", error });
  }
};

// Delete Product
const deleteProduct = async (req, res) => {
  try {
    await Product.findByIdAndUpdate(
      req.query.productId,
      {
        isDeleted: true,
        deletedAt: new Date(),
      },
      { new: true }
    );
    res.json({ message: "Product deleted" });
  } catch (error) {
    res.status(500).json({ message: "Error deleting product", error });
  }
};

// Get All Products
const getAllProducts = async (req, res) => {
  try {
    const products = await Product.find({
      isDeleted: false,
    }).sort({ createdAt: -1 });

    // Format the response to include the latest bagsize
    const formattedProducts = products.map((product) => ({
      ...product.toObject(),
      bagssize: product.bagsizes?.[product.bagsizes.length - 1]?.size || 0,
    }));

    res.status(200).json({ products: formattedProducts });
  } catch (error) {
    res.status(500).json({ message: "Error fetching products", error });
  }
};

// Get Single Product
const getProductById = async (req, res) => {
  try {
    const product = await Product.findById(req.query.productId);
    if (!product) {
      return res.status(404).json({
        message: "Product Not Founde with this id",
      });
    }
    res.status(200).json({
      product: {
        ...product.toObject(),
        bagssize: product.bagsizes?.[product.bagsizes.length - 1]?.size || 0,
      },
    });
  } catch (error) {
    res.status(500).json({ message: "Error fetching product", error });
  }
};

// wrote api to clear whole db and all schema

export {
  addProduct,
  deleteProduct,
  getAllProducts,
  getProductById,
  updateProduct,
};
