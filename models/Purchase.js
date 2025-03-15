import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const PurchaseSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      unique: true,
      default: () => `INV-${uuidv4().split("-")[0]}`,
    }, // Unique purchase invoice
    vendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
      required: true,
    },
    items: [
      {
        productId: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "Product",
          required: true,
        },
        quantity: { type: Number, required: true },
      },
    ],
    subtotal: { type: Number, required: true }, // Total before GST
    gstPercentage: { type: Number, required: true }, // GST percentage
    gstAmount: { type: Number, required: true }, // Calculated GST amount
    totalAmount: { type: Number, required: true }, // Final total amount including GST
    purchaseDate: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

const Purchase = mongoose.model("Purchase", PurchaseSchema);

export default Purchase;
