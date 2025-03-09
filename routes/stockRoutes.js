import express from "express";
import {
  addStock,
  getLowStockAlerts,
  getStockByProduct,
  getStocksHistory,
} from "../controllers/stockController.js";

const router = express.Router();

router.post("/add", addStock);
router.get("/history", getStocksHistory);
router.get("/:productId", getStockByProduct);
router.get("/alerts/low-stock", getLowStockAlerts);

export default router;
