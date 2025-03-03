import mongoose from 'mongoose'

const SalesSchema = new mongoose.Schema({
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true },
    sellingPrice: { type: Number, required: true },
    customerName: { type: String, required: true },
    date: { type: Date, default: Date.now },
  }, { timestamps: true });
  
  const Sales = mongoose.model('Sales', SalesSchema);
  
  export default Sales;