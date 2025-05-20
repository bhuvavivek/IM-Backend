import { Router } from "express";
import {
  generateCustomerReport,
  generatePLReport,
  generatePurchaseReport,
  generateSalesReport,
  generateVendorReport,
  getCustomerInvoiceReport,
  getOverallReport,
  getProductReport,
  getStockSummaryReport,
  getVendorInvoiceReport,
} from "../controllers/reportController.js";

const router = Router();

router.get("/overall", getOverallReport);
// GET /api/reports/sales-summary?startDate=2024-01-01&endDate=2024-12-31&download=true
router.get("/sales-summary", generateSalesReport);
router.get("/purchase-summary", generatePurchaseReport);
router.get("/sale/customer/:customerId", generateCustomerReport);
router.get("/purchase/vendor/:vendorId", generateVendorReport);
router.get("/customer-invoice/:customerId", getCustomerInvoiceReport);
router.get("/vendor-invoice/:vendorId", getVendorInvoiceReport);
router.get("/stock-summary", getStockSummaryReport);
router.get("/product/:productId", getProductReport);
router.get("/pnl", generatePLReport);
export default router;
