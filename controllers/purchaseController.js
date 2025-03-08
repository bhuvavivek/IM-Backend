import Purchase from "../models/Purchase.js";

const addPurchase = async (req, res) => {
    try {
      const purchase = new Purchase(req.body);
      await purchase.save();
      res.status(201).json(purchase);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };
  
  const getPurchases = async (req, res) => {
    try {
      const purchases = await Purchase.find().populate('vendorId').populate('productId');
      res.status(200).json(purchases);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
export {addPurchase,getPurchases}