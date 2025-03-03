const addSale = async (req, res) => {
    try {
      const sale = new Sales(req.body);
      await sale.save();
      res.status(201).json(sale);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };
  
  const getSales = async (req, res) => {
    try {
      const sales = await Sales.find().populate('productId');
      res.status(200).json(sales);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  
  export {addSale,getSales}