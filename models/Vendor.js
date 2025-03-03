import mongoose from "mongoose";

const VendorSchema = new mongoose.Schema({
    name: { type: String, required: true },
    contact: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    address: { type: String, required: true },
  }, { timestamps: true });
  
  const Vendor = mongoose.model('Vendor', VendorSchema);

  export default  Vendor;