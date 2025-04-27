import { Router } from "express";
import {
  createExpense,
  deleteExpense,
  updateExpense,
} from "../controllers/expenseController.js";

const router = Router();

router.post("/", createExpense);
router.delete("/:id", deleteExpense);
router.put("/:id", updateExpense);

export default router;
