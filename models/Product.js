import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    unit: { type: String, enum: ["KG", "GRAM", "TON"], default: "KG" },
    weight: { type: String, required: true },
    stock: { type: Number, required: true, default: 0 },
    totalWeight: { type: Number, required: true, default: 0 },
    isBesan: { type: Boolean, default: true },
    isRawMaterial: { type: Boolean, default: false },
    isWastage: { type: Boolean, default: false },
    HSNCode: { type: String, required: true },
    bags: [
      {
        size: { type: Number, required: true },
        quantity: { type: Number, required: true },
        weight: { type: Number, required: true },
      },
    ],
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true }
);

ProductSchema.pre("save", function (next) {
  const totalweight = parseFloat(this.weight) * this.stock;
  this.totalWeight = Number(totalweight).toFixed(2);
  next();
});

const Product = mongoose.model("Product", ProductSchema);
export default Product;
