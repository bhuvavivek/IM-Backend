import { Router } from "express";
import {
  createExpense,
  deleteExpense,
  getExpense,
  getExpenses,
  updateExpense,
} from "../controllers/expenseController.js";

const router = Router();

router.post("/", createExpense);
router.delete("/:id", deleteExpense);
router.put("/:id", updateExpense);
router.get("/", getExpenses);
router.get("/:id", getExpense);

export default router;
