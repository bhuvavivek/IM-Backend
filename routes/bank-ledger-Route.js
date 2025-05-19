import express from "express";
import { CreateCreditTransaction } from "../controllers/bank-ledger-controller.js";

const router = express.Router();

router.post("/credit" , CreateCreditTransaction)
export default router;
