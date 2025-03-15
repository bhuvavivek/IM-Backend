import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";

const SalesSchema = new mongoose.Schema(
  {
    invoiceNumber: {
      type: String,
      unique: true,
      default: () => `INV-${uuidv4().split("-")[0]}`,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Customer",
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
    subtotal: { type: Number, required: true }, // Sum of all item totals before GST
    gstPercentage: { type: Number, required: true }, // GST percentage applied
    gstAmount: { type: Number, required: true }, // GST amount calculated from subtotal
    totalAmount: { type: Number, required: true }, // Final total amount including GST
    createdAt: { type: Date, default: Date.now },
    shippingDate: { type: Date },
  },
  { timestamps: true }
);

const Sales = mongoose.model("Sales", SalesSchema);

export default Sales;
