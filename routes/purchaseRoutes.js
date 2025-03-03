import express from 'express';
import {addPurchase , getPurchases} from '../controllers/purchaseController.js'
const router = express.Router();


router.route('/').post(addPurchase).get(getPurchases);

export default router