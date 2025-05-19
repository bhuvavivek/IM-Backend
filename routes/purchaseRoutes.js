import express from "express";
import {
  addPaymentToPurchase,
  addPurchase,
  deletePurchase,
  getPurchase,
  getPurchaseInvoiceById,
  getPurchaseLastInvoiceNumber,
  getPurchases,
  getPurchasesByVendorId,
  updatePurchase,
} from "../controllers/purchaseController.js";
const router = express.Router();

router.route("/").post(addPurchase).get(getPurchases);
router.get("/lastInvoiceNumber", getPurchaseLastInvoiceNumber);
router.get("/:id", getPurchase);
router.post("/payment/:id", addPaymentToPurchase);
router.put("/:id", updatePurchase);
router.delete("/:id", deletePurchase);
router.get("/invoice/:id", getPurchaseInvoiceById);
router.get('/vendor/:vendorId',getPurchasesByVendorId)

export default router;
