import { Router } from "express";
import {
  generateCustomerPurchaseReport,
  generateCustomerReport,
  generateDetailedInvoiceReport,
  generateSalesReport,
  getOverallReport,
} from "../controllers/reportController.js";

const router = Router();

router.get("/overall", getOverallReport);
router.get("/invoice-report", generateDetailedInvoiceReport);
// GET /api/reports/sales-summary?startDate=2024-01-01&endDate=2024-12-31&download=true
router.get("/sales-summary", generateSalesReport);
router.get("/sales/:customerId", generateCustomerReport);
router.get("/customer-purchase", generateCustomerPurchaseReport);
export default router;
