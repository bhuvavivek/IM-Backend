import express from "express";
import { addCustomer, getCustomer } from "../controllers/customerController.js";

const router = express.Router();

router.route("/").post(addCustomer).get(getCustomer);

export default router;
