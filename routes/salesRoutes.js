import express from "express";
import { addSale, getSale, getSales } from "../controllers/salesController.js";

const router = express.Router();

router.route("/").post(addSale).get(getSales);
router.get("/:id", getSale);

export default router;
