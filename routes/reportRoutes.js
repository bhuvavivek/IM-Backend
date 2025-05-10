import { Router } from "express";
import {
  generateCustomerPurchaseReport,
  generateCustomerReport,
  generateSalesReport,
  getCustomerInvoiceReport,
  getOverallReport,
} from "../controllers/reportController.js";

const router = Router();

router.get("/overall", getOverallReport);
// GET /api/reports/sales-summary?startDate=2024-01-01&endDate=2024-12-31&download=true
router.get("/sales-summary", generateSalesReport);
router.get("/sale/customer/:customerId", generateCustomerReport);
router.get("/customer-invoice/:customerId", getCustomerInvoiceReport);
router.get("/customer-purchase", generateCustomerPurchaseReport);
export default router;
