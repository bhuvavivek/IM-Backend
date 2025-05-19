import express from "express";
import { CreateCreditTransaction , generateLedgerPDF } from "../controllers/bank-ledger-controller.js";

const router = express.Router();

router.post("/credit" , CreateCreditTransaction)
router.get('/ledger/pdf',generateLedgerPDF)
export default router;
