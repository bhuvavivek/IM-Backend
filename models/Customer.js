import mongoose from "mongoose";

const CustomerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    contact: { type: String, required: true },
    email: { type: String, required: true, unique: true },
    address: { type: String, required: true },
  },
  { timestamps: true }
);

const Customer = mongoose.model("Customer", CustomerSchema);

export default Customer;
