import express from "express";
import {
  addPaymentToPurchase,
  addPurchase,
  deletePurchase,
  getPurchase,
  getPurchaseInvoiceById,
  getPurchases,
  updatePurchase,
} from "../controllers/purchaseController.js";
const router = express.Router();

router.route("/").post(addPurchase).get(getPurchases);
router.get("/:id", getPurchase);
router.post("/payment/:id", addPaymentToPurchase);
router.put("/:id", updatePurchase);
router.delete("/:id", deletePurchase);
router.get("/invoice/:id", getPurchaseInvoiceById);

export default router;
