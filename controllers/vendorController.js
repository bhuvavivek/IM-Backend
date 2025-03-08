import Vendor from "../models/Vendor.js";

const addVendor = async (req, res) => {
    try {
      const vendor = new Vendor(req.body);
      await vendor.save();
      res.status(201).json(vendor);
    } catch (error) {
      res.status(400).json({ error: error.message });
    }
  };
  
  const getVendors = async (req, res) => {
    try {
      const vendors = await Vendor.find();
      res.status(200).json(vendors);
    } catch (error) {
      res.status(500).json({ error: error.message });
    }
  };
  

  export {addVendor , getVendors}