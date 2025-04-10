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

    subtotal: { type: Number, required: true },
    earlyPaymentDiscount: { type: Number, default: 0 }, // 2% on subtotal if early
    gstPercentage: { type: Number, required: true }, // Total GST (e.g. 18)
    gstAmount: { type: Number, required: true }, // Total GST amount

    // 👥 GST Split
    cgst: { type: Number }, // Calculated as gstAmount / 2
    sgst: { type: Number }, // Calculated as gstAmount / 2

    totalAmount: { type: Number, required: true }, // subtotal - discount + gst

    // 🧾 Dates
    createdAt: { type: Date, default: Date.now },
    purchaseDate: { type: Date, default: Date.now }, // Date of purchase
    dueDate: { type: Date },
    paymentSendDate: { type: Date }, // editable manually
  },
  { timestamps: true }
);

const Purchase = mongoose.model("Purchase", PurchaseSchema);

export default Purchase;
