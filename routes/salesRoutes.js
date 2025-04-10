import express from "express";
import {
  addPaymentToSale,
  addSale,
  getSale,
  getSales,
} from "../controllers/salesController.js";

const router = express.Router();

router.route("/").post(addSale).get(getSales);
router.post("/:id/payment", addPaymentToSale);
router.get("/:id", getSale);
export default router;
