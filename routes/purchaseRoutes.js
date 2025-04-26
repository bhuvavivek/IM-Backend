import express from "express";
import {
  addPaymentToPurchase,
  addPurchase,
  getPurchase,
  getPurchases,
} from "../controllers/purchaseController.js";
const router = express.Router();

router.route("/").post(addPurchase).get(getPurchases);
router.get("/:id", getPurchase);
router.post("/payment/:id", addPaymentToPurchase);

export default router;
