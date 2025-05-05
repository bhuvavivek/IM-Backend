import Product from "../models/Product.js";
import Stock from "../models/Stock.js";

// Add stock for a product
export const stockChange = async (req, res) => {
  try {
    const { productId, lowStockThreshold, change, reason, changeType, bags } =
      req.body;

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    // Check if stock exists, update or create new
    let stock = await Stock.findOne({ productId });
    if (!stock) {
      stock = new Stock({
        productId,
        quantity: product.stock,
        history: [],
      });
    }

    if (changeType === "STOCK IN") {
      stock.quantity += change;
      stock.history.push({
        change: change,
        reason: reason || "Stock added",
        changeType,
        bags: bags,
      });
      product.stock += change; // Update product stock
    }

    if (changeType === "STOCK OUT") {
      stock.quantity -= change;
      stock.history.push({
        change: change,
        reason: reason || "Stock removed",
        changeType,
        bags: bags,
      });
      product.stock -= change; // Update product stock
    }

    await stock.save();
    await product.save(); // Save updated product stock
    res.status(200).json({ message: "Stock updated successfully", stock });
  } catch (error) {
    console.log(error);
    res.status(500).json({ message: error.message });
  }
};

// Get stock details for a product
export const getStockByProduct = async (req, res) => {
  try {
    const stock = await Stock.findOne({
      productId: req.params.productId,
    }).populate("productId");
    if (!stock) return res.status(404).json({ message: "Stock not found" });

    res.status(200).json({ stock });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get low stock alerts
export const getLowStockAlerts = async (req, res) => {
  try {
    const lowStockProducts = await Stock.find({
      quantity: { $lt: "$lowStockThreshold" },
    }).populate("productId");

    res.status(200).json(lowStockProducts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getStocksHistory = async (req, res) => {
  try {
    const { isWestage } = req.query;
    const isWastageFilter = isWestage === "true";

    const stocks = await Stock.aggregate([
      {
        $lookup: {
          from: "products",
          localField: "productId",
          foreignField: "_id",
          as: "product",
        },
      },
      { $unwind: "$product" },
      {
        $match: isWastageFilter
          ? { "product.isWastage": true }
          : { "product.isWastage": false },
      },
      {
        $project: {
          _id: 1,
          productId: "$product._id",
          productName: "$product.name",
          quantity: 1,
          lowStockThreshold: 1,
          history: 1,
          createdAt: 1,
          updatedAt: 1,
          product: "$product",
        },
      },
    ]);

    res.status(200).json({ stocks });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const deleteStock = async (req, res) => {
  try {
    const { id } = req.params;
    const stock = await Stock.findByIdAndDelete(id);
    if (!stock) return res.status(404).json({ message: "Stock not found" });
    res.status(200).json({ message: "Stock deleted successfully" });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
