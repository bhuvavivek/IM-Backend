import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    priceWithoutGst: { type: Number, required: true },
    gstPercentage: { type: Number, required: true },
    priceWithGst: { type: Number, required: true },
    weight: { type: String, required: true },
    stock: { type: Number, required: true, default: 0 },
  },
  { timestamps: true }
);

const Product = mongoose.model("Product", ProductSchema);
export default Product;
