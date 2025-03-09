import express from "express";
import {
  addCustomer,
  getCustomer,
  getCustomers,
  updateCustomer,
} from "../controllers/customerController.js";

const router = express.Router();

router.route("/").post(addCustomer).get(getCustomers);

router.get("/:customerId", getCustomer);
router.put("/:customerId", updateCustomer);

export default router;
