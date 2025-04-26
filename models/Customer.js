import mongoose from "mongoose";

const CustomerSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    contact: { type: Number, required: true },
    email: { type: String, required: true, unique: true },
    businessInformation: {
      country: { type: String, required: true },
      Address: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pinCode: { type: Number, required: true },
      gstNumber: { type: String, required: true },
      businessName: { type: String, required: true },
    },
    shippingAddress: {
      country: { type: String, required: true },
      Address: { type: String, required: true },
      city: { type: String, required: true },
      state: { type: String, required: true },
      pinCode: { type: Number, required: true },
    },
    transportInfo: {
      companyName: { type: String },
      contactNumber: { type: Number },
      address: { type: String },
    },
    bankInfo: {
      bankName: { type: String },
      accountNumber: { type: Number },
      ifscCode: { type: String },
      accountHolderName: { type: String },
    },
  },
  { timestamps: true }
);

const Customer = mongoose.model("Customer", CustomerSchema);

export default Customer;
