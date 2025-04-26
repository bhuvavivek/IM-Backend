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
        price: { type: Number, required: true },
        quantity: { type: Number, required: true },
        bag: { type: Number, required: true },
        total: { type: Number, required: true },
        name: { type: String, required: true },
        weight: { type: Number, required: true },
        totalweight: { type: Number, required: true },
        bagsize: { type: Number, required: true },
      },
    ],
    // 💰 Core Amounts
    subtotal: { type: Number, required: true },
    earlyPaymentDiscount: { type: Number, default: 0 }, // 2% on subtotal if early
    gstPercentage: { type: Number, required: true }, // Total GST (e.g. 18)
    gstAmount: { type: Number, required: true }, // Total GST amount

    // 👥 GST Split
    cgst: { type: Number, required: true }, // Calculated as gstAmount / 2
    sgst: { type: Number, required: true }, // Calculated as gstAmount / 2
    totalAmount: { type: Number, required: true }, // subtotal - discount + gst

    // 🧾 Dates
    createdAt: { type: Date, default: Date.now },
    dueDate: { type: Date, required: true },
    payments: [
      {
        amount: { type: Number, required: true },
        date: { type: Date, default: Date.now },
        mode: { type: String },
        remarks: { type: String },
      },
    ],
    amountPaid: { type: Number, default: 0 },
    pendingAmount: { type: Number, default: 0 },
    isFullyPaid: { type: Boolean, default: false },

    // 🧍‍♂️ Salesperson Commission
    salesperson: {
      name: { type: String },
      commissionPercentage: { type: Number },
      commissionAmount: { type: Number },
    },

    // Status
    status: {
      type: String,
      enum: ["Pending", "Paid", "Overdue"],
      default: "Pending",
    },
  },
  { timestamps: true }
);

const Sales = mongoose.model("Sales", SalesSchema);

export default Sales;
