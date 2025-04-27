import { Router } from "express";
import { getOverallReport } from "../controllers/reportController.js";

const router = Router();

router.get("/overall", getOverallReport);

export default router;
