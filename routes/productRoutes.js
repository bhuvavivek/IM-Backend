import { Router } from "express";
import {
  addProduct,
  deleteProduct,
  getAllProducts,
  getProductById,
  updateProduct,
} from "../controllers/productController.js";
const router = Router();

router.post("/", addProduct);
router.put("/", updateProduct);
router.delete("/", deleteProduct);
router.get("/list", getAllProducts);
router.get("/details", getProductById);

export default router;
