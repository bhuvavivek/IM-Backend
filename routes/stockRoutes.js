import express from "express";
import {
  getLowStockAlerts,
  getStockByProduct,
  getStocksHistory,
  stockChange,
} from "../controllers/stockController.js";

const router = express.Router();

router.post("/change", stockChange);
router.get("/history", getStocksHistory);
router.get("/:productId", getStockByProduct);
router.get("/alerts/low-stock", getLowStockAlerts);

export default router;
