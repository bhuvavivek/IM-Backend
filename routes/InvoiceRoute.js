import { Router } from "express";

const router = Router()

router.post('/', generateInvoice);
router.get('/export/excel', exportInvoicesToExcel);
router.get('/export/pdf/:id', exportInvoiceToPDF);


export default router