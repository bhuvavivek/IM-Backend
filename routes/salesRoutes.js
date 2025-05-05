import express from "express";
import {
  addPaymentToSale,
  addSale,
  deleteSale,
  getSale,
  getSaleInvoiceById,
  getSales,
  updateSale,
} from "../controllers/salesController.js";

const router = express.Router();

router.route("/").post(addSale).get(getSales);
router.post("/payment/:id", addPaymentToSale);
router.get("/:id", getSale);
router.delete("/:id", deleteSale);
router.put("/:id", updateSale);
router.get("/invoice/:id", getSaleInvoiceById);
export default router;
