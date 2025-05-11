import { Router } from "express";
import {
  generateCustomerReport,
  generateSalesReport,
  getCustomerInvoiceReport,
  getOverallReport,
  getProductReport,
  getStockSummaryReport,
} from "../controllers/reportController.js";

const router = Router();

router.get("/overall", getOverallReport);
// GET /api/reports/sales-summary?startDate=2024-01-01&endDate=2024-12-31&download=true
router.get("/sales-summary", generateSalesReport);
router.get("/sale/customer/:customerId", generateCustomerReport);
router.get("/customer-invoice/:customerId", getCustomerInvoiceReport);
router.get("/stock-summary", getStockSummaryReport);
router.get("/product/:productId", getProductReport);
export default router;
