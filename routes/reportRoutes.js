import { Router } from "express";
import {
  generateDetailedInvoiceReport,
  getOverallReport,
} from "../controllers/reportController.js";

const router = Router();

router.get("/overall", getOverallReport);
router.get("/invoice-report", generateDetailedInvoiceReport);

export default router;
