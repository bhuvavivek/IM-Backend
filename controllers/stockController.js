import Stock from '../models/Stock.js';
import Product from '../models/Product.js';

// Add stock for a product
export const addStock = async (req, res) => {
  try {
    const { productId, quantity, lowStockThreshold } = req.body;

    // Check if product exists
    const product = await Product.findById(productId);
    if (!product) return res.status(404).json({ message: 'Product not found' });

    // Check if stock exists, update or create new
    let stock = await Stock.findOne({ productId });
    if (stock) {
      stock.quantity += quantity;
      stock.history.push({ change: quantity, reason: 'Stock added' });
    } else {
      stock = new Stock({
        productId,
        quantity,
        lowStockThreshold,
        history: [{ change: quantity, reason: 'Initial stock' }],
      });
    }

    await stock.save();
    res.status(200).json({ message: 'Stock updated successfully', stock });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get stock details for a product
export const getStockByProduct = async (req, res) => {
  try {
    const stock = await Stock.findOne({ productId: req.params.productId }).populate('productId');
    if (!stock) return res.status(404).json({ message: 'Stock not found' });

    res.status(200).json(stock);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update stock quantity (Increase or Decrease)
export const updateStock = async (req, res) => {
  try {
    const { quantity, reason } = req.body;
    const stock = await Stock.findOne({ productId: req.params.productId });

    if (!stock) return res.status(404).json({ message: 'Stock not found' });

    stock.quantity += quantity;
    stock.history.push({ change: quantity, reason });

    await stock.save();
    res.status(200).json({ message: 'Stock updated', stock });

  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Get low stock alerts
export const getLowStockAlerts = async (req, res) => {
  try {
    const lowStockProducts = await Stock.find({ quantity: { $lt: '$lowStockThreshold' } }).populate('productId');

    res.status(200).json(lowStockProducts);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
