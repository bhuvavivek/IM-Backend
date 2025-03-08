import { Router } from "express";
import {generateInvoice,exportInvoiceToPDF,exportInvoicesToExcel} from '../controllers/InvoiceController.js'


const router = Router()

router.post('/', generateInvoice);
router.get('/export/excel', exportInvoicesToExcel);
router.get('/export/pdf/:id', exportInvoiceToPDF);


export default router