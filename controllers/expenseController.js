import Expense from "../models/Expense.js";
const createExpense = async (req, res) => {
  try {
    const { name, amount, description, date, isGstApplicable, gstPercentage } =
      req.body;

    const expense = new Expense({
      name,
      amount,
      description,
      date,
      isGstApplicable,
      gstPercentage,
    });

    await expense.save();
    res.status(201).json({ message: "Expense created successfully", expense });
  } catch (error) {
    console.error("Create Expense Error:", error);
    res
      .status(500)
      .json({ message: "Failed to create expense", error: error.message });
  }
};

const updateExpense = async (req, res) => {
  try {
    const { id } = req.params;
    const updates = req.body;

    const expense = await Expense.findByIdAndUpdate(id, updates, { new: true });

    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    res.status(200).json({ message: "Expense updated successfully", expense });
  } catch (error) {
    console.error("Update Expense Error:", error);
    res
      .status(500)
      .json({ message: "Failed to update expense", error: error.message });
  }
};

// Soft Delete an Expense
const deleteExpense = async (req, res) => {
  try {
    const { id } = req.params;

    const expense = await Expense.findByIdAndUpdate(
      id,
      { isDeleted: true, deletedAt: new Date() },
      { new: true }
    );

    if (!expense) {
      return res.status(404).json({ message: "Expense not found" });
    }

    res
      .status(200)
      .json({ message: "Expense deleted (soft delete) successfully", expense });
  } catch (error) {
    console.error("Delete Expense Error:", error);
    res
      .status(500)
      .json({ message: "Failed to delete expense", error: error.message });
  }
};

export { createExpense, deleteExpense, updateExpense };
