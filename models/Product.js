import mongoose from "mongoose";

const ProductSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, unique: true },
    price: { type: Number, required: true },
    unit: { type: String, enum: ["KG", "GRAM", "TON"], default: "KG" },
    weight: { type: String, required: true },
    stock: { type: Number, required: true, default: 0 },
    totalWeight: { type: Number, required: true, default: 0 },
    isBesan: { type: Boolean, default: true },
    isRawMaterial: { type: Boolean, default: false },
    isWastage: { type: Boolean, default: false },
    bagsizes: {
      type: [
        {
          size: { type: Number, required: true },
          date: { type: Date, default: Date.now },
        },
      ],
      default: [{ size: 50, date: Date.now() }],
    },
    totalBags: { type: Number, default: 0 },
  },
  { timestamps: true }
);

ProductSchema.pre("save", function (next) {
  this.totalWeight = parseFloat(this.weight) * this.stock;
  this.totalBags = Math.floor(this.totalWeight / this.bagsizes[0].size);
  next();
});

ProductSchema.pre("findOneAndUpdate", function (next) {
  const update = this.getUpdate();
  if (update.weight !== undefined || update.stock !== undefined) {
    const weight = parseFloat(update.weight || this._update.weight);
    const stock = update.stock || this._update.stock;
    update.totalWeight = weight * stock;
    update.totalBags = Math.floor(
      update.totalWeight / this._update.bagsizes[0].size
    );
  }
  next();
});

const Product = mongoose.model("Product", ProductSchema);
export default Product;
