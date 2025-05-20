import express from "express";
import {
  CreateCreditTransaction,
  generateConsolidatedLedgerPDF,
  generateLedgerPDF,
} from "../controllers/bank-ledger-controller.js";

const router = express.Router();

router.post("/credit", CreateCreditTransaction);
router.get("/ledger/pdf", generateLedgerPDF);
router.get("/report/ledger", generateConsolidatedLedgerPDF);
export default router;
