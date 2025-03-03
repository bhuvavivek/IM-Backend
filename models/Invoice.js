import mongoose from "mongoose";

const InvoiceSchema = new mongoose.Schema({
    salesId: { type: mongoose.Schema.Types.ObjectId, ref: 'Sales', required: true },
    customerName: { type: String, required: true },
    totalAmount: { type: Number, required: true },
    gstAmount: { type: Number, required: true },
    finalAmount: { type: Number, required: true },
    date: { type: Date, default: Date.now },
  }, { timestamps: true });
  
  const Invoice = mongoose.model('Invoice', InvoiceSchema);

  export default Invoice