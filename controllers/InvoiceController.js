import Invoice from '../models/Invoice'
import excelJS from 'exceljs';
import pdfkit from 'pdfkit';


// Generate Invoice
const generateInvoice = async (req, res) => {
  try {
    const invoice = new Invoice(req.body);
    await invoice.save();
    res.status(201).json(invoice);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Export Invoices to Excel
const exportInvoicesToExcel = async (req, res) => {
  try {
    const invoices = await Invoice.find();
    const workbook = new excelJS.Workbook();
    const worksheet = workbook.addWorksheet('Invoices');

    worksheet.columns = [
      { header: 'Customer Name', key: 'customerName', width: 20 },
      { header: 'Total Amount', key: 'totalAmount', width: 15 },
      { header: 'GST Amount', key: 'gstAmount', width: 15 },
      { header: 'Final Amount', key: 'finalAmount', width: 15 },
      { header: 'Date', key: 'date', width: 20 },
    ];

    invoices.forEach((invoice) => worksheet.addRow(invoice));
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', 'attachment; filename=invoices.xlsx');
    await workbook.xlsx.write(res);
    res.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

// Export Invoice as PDF
const exportInvoiceToPDF = async (req, res) => {
  try {
    const invoice = await Invoice.findById(req.params.id);
    if (!invoice) {
      return res.status(404).json({ error: 'Invoice not found' });
    }

    const doc = new pdfkit();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=invoice_${invoice._id}.pdf`);
    doc.pipe(res);
    doc.text(`Invoice ID: ${invoice._id}`);
    doc.text(`Customer Name: ${invoice.customerName}`);
    doc.text(`Total Amount: ${invoice.totalAmount}`);
    doc.text(`GST Amount: ${invoice.gstAmount}`);
    doc.text(`Final Amount: ${invoice.finalAmount}`);
    doc.text(`Date: ${invoice.date}`);
    doc.end();
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
  

  export {generateInvoice , exportInvoicesToExcel , exportInvoiceToPDF}