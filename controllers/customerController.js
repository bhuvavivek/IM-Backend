import Customer from "../models/Customer.js";

const addCustomer = async (req, res) => {
  try {
    const customer = new Customer(req.body);
    await customer.save();
    res.status(201).json({ customer });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getCustomers = async (req, res) => {
  try {
    const customers = await Customer.find();
    res.status(200).json({ customers });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getCustomer = async (req, res) => {
  try {
    const customerId = req.params.customerId;
    const customer = await Customer.findById(customerId);
    if (!customer) {
      res.status(404).json({ message: "customer not found" });
    }

    res.status(200).json({ customer });
  } catch (erorr) {
    console.log(erorr);
  }
};

export { addCustomer, getCustomer, getCustomers };
