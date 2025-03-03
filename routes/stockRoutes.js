import express from 'express';
import { addStock, getStockByProduct, updateStock, getLowStockAlerts } from '../controllers/stockController.js';

const router = express.Router();

router.post('/add', addStock);
router.get('/:productId', getStockByProduct);
router.put('/:productId', updateStock);
router.get('/alerts/low-stock', getLowStockAlerts);

export default router;
