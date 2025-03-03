import {Router} from 'express'
import { addProduct, updateProduct, deleteProduct, getAllProducts, getProductById } from '../controllers/productController.js'
const router = Router();

router.post('/', addProduct);
router.put('/:id', updateProduct);
router.delete('/:id', deleteProduct);
router.get('/', getAllProducts);
router.get('/:id', getProductById);

export default router;
