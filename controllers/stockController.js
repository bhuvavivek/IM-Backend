import Product from "../models/Product.js";
import Stock from "../models/Stock.js";

// Add stock for a product
export const addStock = async (req, res) => {
  try {
    const { productId, lowStockThreshold, change, reason, changeType } =
      req.body;

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: "Product not found" });

    // Check if stock exists, update or create new
    let stock = await Stock.findOne({ productId });

    if (changeType === "STOCK IN") {
      stock.quantity += change;
      stock.lowStockThreshold = lowStockThreshold;
      stock.history.push({
        change: change,
        reason: "Stock added" || reason,
        changeType,
      });
    }

    if (changeType === "STOCK OUT") {
      stock.quantity -= quantity;
      stock.lowStockThreshold = lowStockThreshold;
      stock.history.push({
        change: quantity,
        reason: "Stock removed" || reason,
        changeType,
      });
    }

    await stock.save();
    res.status(200).json({ message: "Stock updated successfully", stock });
  } catch (error) {
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

    res.status(200).json(stock);
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
    const stocks = await Stock.find().populate("productId");
    res.status(200).json({ stocks });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
