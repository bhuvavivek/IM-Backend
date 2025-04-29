import mongoose from "mongoose";

const ExpenseSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },

    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    date: {
      type: Date,
      default: Date.now,
      required: true,
    },
    description: {
      type: String,
      trim: true,
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
    deletedAt: {
      type: Date,
    },
    gstPercentage: {
      type: Number,
      default: 0,
      min: 0,
      max: 100,
    },
    gstAmount: {
      type: Number,
      default: 0,
      min: 0,
    },

    isGstApplicable: {
      type: Boolean,
      default: false,
    },
    total: {
      type: Number,
      required: true,
    },
  },
  { timestamps: true }
);

const Expense = mongoose.model("Expense", ExpenseSchema);

export default Expense;

ExpenseSchema.pre("save", function (next) {
  if (this.isGstApplicable && this.gstPercentage > 0) {
    this.gstAmount = (this.amount * this.gstPercentage) / 100;
  }
  next();
});
