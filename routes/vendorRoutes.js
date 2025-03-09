import express from "express";
import { updateCustomer } from "../controllers/customerController.js";
import {
  addVendor,
  getVendor,
  getVendors,
} from "../controllers/vendorController.js";

const router = express.Router();

router.route("/").post(addVendor).get(getVendors);

router.get("/:vendorId", getVendor);
router.put("/:vendorId", updateCustomer);

export default router;
