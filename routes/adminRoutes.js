import {Router} from 'express'
import { createAdmin, loginAdmin , getProfile } from '../controllers/adminController.js'
import { verifyToken } from '../middleware/authMiddleware.js';

const router = Router();

router.post('/login', loginAdmin);
// router.get('/create-admin',createAdmin)
router.get('/me',verifyToken,getProfile)

export default router;
