import mongoose from "mongoose";

const PurchaseSchema = new mongoose.Schema({
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Vendor', required: true },
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true },
    purchasePrice: { type: Number, required: true },
    date: { type: Date, default: Date.now },
  }, { timestamps: true });
  
  const Purchase = mongoose.model('Purchase', PurchaseSchema);
  
  export default Purchase