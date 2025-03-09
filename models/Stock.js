import mongoose from "mongoose";

const StockSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Product",
      required: true,
    },
    quantity: { type: Number, required: true, default: 0 },
    lowStockThreshold: { type: Number, required: true, default: 10 },
    history: [
      {
        change: Number,
        date: { type: Date, default: Date.now, required: true },
        reason: String,
        changeType: { type: String, enum: ["STOCK IN", "STOCK OUT"] },
      },
    ],
  },
  { timestamps: true }
);

const Stock = mongoose.model("Stock", StockSchema);

export default Stock;
