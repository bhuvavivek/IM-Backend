import express from 'express';

const router = express.Router();
import {addVendor,getVendors} from '../controllers/vendorController.js'

router.route('/').post(addVendor).get(getVendors);

export default router