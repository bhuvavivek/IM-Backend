import express from "express";
import {
  addCustomer,
  getCustomer,
  getCustomers,
} from "../controllers/customerController.js";

const router = express.Router();

router.route("/").post(addCustomer).get(getCustomers);

router.get("/:customerId", getCustomer);

export default router;
