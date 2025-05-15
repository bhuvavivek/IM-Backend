import { Router } from "express";
import {
  createAdmin,
  getProfile,
  loginAdmin,
} from "../controllers/adminController.js";
import { verifyToken } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/login", loginAdmin);
router.get("/create-admin", createAdmin);
router.get("/me", verifyToken, getProfile);

export default router;
