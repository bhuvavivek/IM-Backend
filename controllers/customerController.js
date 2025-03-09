import Customer from "../models/Customer.js";

const addVendor = async (req, res) => {
  try {
    const customer = new Customer(req.body);
    await customer.save();
    res.status(201).json({ customer });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getVendors = async (req, res) => {
  try {
    const customers = await Customer.find();
    res.status(200).json({ customers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export { addVendor, getVendors };
