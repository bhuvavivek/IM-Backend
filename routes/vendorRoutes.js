import express from "express";
import { addVendor, getVendors } from "../controllers/vendorController.js";

const router = express.Router();

router.route("/").post(addVendor).get(getVendors);

export default router;
