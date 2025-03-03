import express from 'express';
import {addSale , getSales} from '../controllers/salesController.js'

const router = express.Router();


router.route('/').post(addSale).get(getSales);

export default router