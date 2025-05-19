import { BankLedger } from "../models/Bank-ledger.js";
import Purchase from "../models/Purchase.js";
import Sales from "../models/Sales.js";
import Customer from '../models/Customer.js'
import Vendor from '../models/Vendor.js'
import { getFinancialYear } from "../utils/common.js";
import PDFDocument from "pdfkit";

const CreateCreditTransaction = async (req, res) => {
  try {
    const { userId, userType, amount, kasar = 0, invoices = [], date } = req.body;

    if (!userId || !userType || amount === undefined || kasar === undefined) {
      return res.status(400).json({
        message: "Please provide userId, userType, amount, and kasar.",
      });
    }


    const allowedTypes = ["Customer", "Vendor"];
    if (!allowedTypes.includes(userType)) {
      return res.status(400).json({
        message: "Invalid userType. Must be 'Customer' or 'Vendor'.",
      });
    }


    const InvoiceEntity = userType === "Customer" ?  Sales : Purchase
    let remainingAmountToAllocate = Number(amount);
    let remainingKasarToAllocate = Number(kasar);
    const updatedInvoices = [];


    for (const invoice of invoices) {
      const invoiceDoc = await InvoiceEntity.findById(invoice.value);


      if (!invoiceDoc) {
        return res.status(404).json({ message: `Invoice not found: ${invoice.value}` });
      }

      const invoiceTotalAmount = Number(invoiceDoc.totalAmount);
      const alreadyPaidAmount = Number(invoiceDoc.amountPaid);
      const yetToBePaid = invoiceTotalAmount - alreadyPaidAmount;
      let paidForThisInvoice = 0;
      let kasarForThisInvoice = 0;

      if (remainingAmountToAllocate > 0 && yetToBePaid > 0) {
        const canPay = Math.min(remainingAmountToAllocate, yetToBePaid);
        paidForThisInvoice = canPay;
        remainingAmountToAllocate -= canPay;
      }

      if (remainingKasarToAllocate > 0 && paidForThisInvoice > 0) {
        const canAllocateKasar = Math.min(remainingKasarToAllocate, paidForThisInvoice);
        kasarForThisInvoice = canAllocateKasar;
        remainingKasarToAllocate -= canAllocateKasar;
      }

      invoiceDoc.payments.push({
        amount:paidForThisInvoice,
        date: new Date(),
        mode: "online",
        remarks: "Bank Transaction",
      })

      const newAmountPaid = Number((alreadyPaidAmount + paidForThisInvoice).toFixed(2));
      const newKasarAmount = Number((Number(invoiceDoc.kasar || 0) + kasarForThisInvoice).toFixed(2));
      const newPendingAmount = Number((invoiceTotalAmount - newAmountPaid).toFixed(2));

      invoiceDoc.amountPaid = newAmountPaid;
      invoiceDoc.kasar = newKasarAmount;
      invoiceDoc.pendingAmount = newPendingAmount;

      if (invoiceTotalAmount <= (newAmountPaid + newKasarAmount)) {
        invoiceDoc.status = 'Paid';
        invoiceDoc.isFullyPaid = true;
      }

      await invoiceDoc.save();
      updatedInvoices.push({
        invoiceId: invoice.value,
        invoiceType: userType === "Customer" ? "Sales" : "Purchase",
        paidAmount: paidForThisInvoice.toFixed(2),
      });
    }

    let currentBalance = 0;
    const ledgerWithLatestTransaction = await BankLedger.aggregate([
      { $match: { userId, userType } },
      { $unwind: "$Transaction" },
      { $sort: { "Transaction.date": -1 } },
      { $limit: 1 },
      { $project: { balanceAfter: "$Transaction.balanceAfter" } }
    ]);



    if (ledgerWithLatestTransaction?.length > 0) {
      currentBalance = ledgerWithLatestTransaction[0].balanceAfter;
    }

    const balanceAfter = currentBalance + Number(amount);
    const financialYear = getFinancialYear();

    const newTransaction = {
      type: "debit",
      amount: Number(amount),
      kasar: Number(kasar),
      invoices:updatedInvoices,
      balanceAfter,
      financialYear,
      date: new Date(),
    };

    let bankLedger = await BankLedger.findOne({ userId, userType });

    if (bankLedger) {
      bankLedger.Transaction.push(newTransaction);
    } else {
      bankLedger = new BankLedger({
        userId,
        userType,
        Transaction: [newTransaction],
      });
    }
    
    await bankLedger.save();

    return res.status(201).json({
      message: "Credit transaction created successfully.",
      data: bankLedger,
    });
  } catch (error) {
    console.error("CreateCreditTransaction Error:", error);
    return res.status(500).json({
      message: "Internal server error.",
      error: error.message,
    });
  }
};

const generateLedgerPDF = async (req, res) => {
  try {
    const { userId, userType, startDate, endDate, financialYear } = req.query;

    if (!userId || !userType) {
      return res.status(400).json({ message: "UserId and userType are required" });
    }

    // Fetch user details (Customer or Vendor)
    const UserModel = userType === 'Customer' ? Customer : Vendor;
    const userDetails = await UserModel.findById(userId);

    if (!userDetails) {
      return res.status(404).json({ message: `${userType} not found` });
    }

    // Fetch bank ledger with filters
    let query = { userId, userType };

    const bankLedger = await BankLedger.findOne(query);

    if (!bankLedger) {
      return res.status(404).json({ message: "Bank ledger not found" });
    }

    // Filter transactions based on date range or financial year
    let transactions = bankLedger.Transaction || [];

    if (startDate && endDate) {
      transactions = transactions.filter(t => {
        const txDate = new Date(t.date);
        return txDate >= new Date(startDate) && txDate <= new Date(endDate);
      });
    }

    if (financialYear) {
      transactions = transactions.filter(t => t.finanacialYear === financialYear);
    }

    // Sort transactions by date
    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate opening balance
    let openingBalance = 0;
    if (transactions.length > 0) {
      const firstTransaction = transactions[0];
      if (firstTransaction.type === 'opening') {
        openingBalance = firstTransaction.amount;
      } else {
        // Calculate opening balance from previous transactions
        openingBalance = firstTransaction.balanceAfter -
          (firstTransaction.type === 'credit' ? firstTransaction.amount : -firstTransaction.amount);
      }
    }

    // Create a new PDF document
    const doc = new PDFDocument({
      size: 'A4',
      margin: 20 // Reduced margin for more content
    });

    // Set response headers
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=ledger-${userDetails.businessInformation.businessName}-${new Date().toISOString().split('T')[0]}.pdf`);

    // Pipe the PDF to response
    doc.pipe(res);

    // Company Header (Your Company Details)
    const companyName = "Ramdev Agro"; // Replace with your actual company name
    const companyAddress = "SURVEY NO 20, PAIKI PLOT NO 1, KHATA NO 736, AT- GALA,TA- DHRANGANDHRA, DIST- SURENDRANAGAR ,363310"; 
    const companyContact = "Phone: +91 94289 51404 | Email: Revabesanind@gmail.com";
    const companyGst = "GST Number: 24ABBFR5130N1Z6x";

    doc.fontSize(15).font('Helvetica-Bold').text(companyName, { align: 'center' });
    doc.moveDown(0.2);
    doc.fontSize(10).font('Helvetica').text(companyAddress, { align: 'center' });
    doc.moveDown(0.2);
    doc.text(companyContact, { align: 'center' });
    doc.moveDown(0.2);
    doc.text(companyGst, { align: 'center' });

    // Line separator
    doc.moveTo(20, doc.y + 10).lineTo(575, doc.y + 10).stroke(); // Adjusted line length
    doc.moveDown(1.5);

    // Ledger Title
    doc.fontSize(14).font('Helvetica-Bold').text('BANK LEDGER', { align: 'center' });
    doc.moveDown(0.5);

    // Customer/Vendor Details
    doc.fontSize(12).font('Helvetica-Bold').text(`${userType} Details:`, 20);
    doc.fontSize(8).font('Helvetica');

    const businessInfo = userDetails.businessInformation;
    const customerDetailsX = 25; // Increased horizontal position
    const bankDetailsX = 25; // Start the bank details at this X position
    let detailY = doc.y;

    doc.fontSize(9).text(`Business Name: ${businessInfo.businessName}`, customerDetailsX, detailY);
    detailY += 15; // Increased vertical spacing
    doc.text(`Name: ${userDetails.firstName} ${userDetails.lastName}`, customerDetailsX, detailY);
    detailY += 15;
    doc.text(`Contact: ${userDetails.contact}`, customerDetailsX, detailY);
    detailY += 15;
    doc.text(`Email: ${userDetails.email}`, customerDetailsX, detailY);
    detailY += 15;
    doc.text(`Address: ${businessInfo.Address}, ${businessInfo.city}, ${businessInfo.state} - ${businessInfo.pinCode}`, customerDetailsX, detailY);
    detailY += 15;
    if (businessInfo.gstNumber) {
      doc.text(`GST Number: ${businessInfo.gstNumber}`, customerDetailsX, detailY);
      detailY += 15;
    }

    // Banking Details if available
    if (userDetails.bankInfo && userDetails.bankInfo.bankName) {
      detailY +=15
      doc.text(`Bank: ${userDetails.bankInfo.bankName}`, bankDetailsX, detailY);
      detailY += 15;
      doc.text(`Account: ${userDetails.bankInfo.accountNumber}`, bankDetailsX, detailY);
      detailY += 15;
      doc.text(`IFSC: ${userDetails.bankInfo.ifscCode}`, bankDetailsX, detailY);
    }

    doc.moveDown(0.5);


    // Date Range
    if (startDate && endDate) {
      doc.fontSize(8).font('Helvetica-Bold').text(`Period: ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`, 20);
    }
    if (financialYear) {
      doc.text(`Financial Year: ${financialYear}`, 20);
    }
    doc.moveDown(1);

    // Table Headers
    const startY = doc.y;
    const rowHeight = 25; // Increased row height for spacing
    const colWidths = [100, 100, 100, 130, 100]; // Adjusted column widths for A4 and removed Particulars
    const cols = ['Date', 'Debit', 'Credit', 'Balance', 'Kasar']; // Removed Particulars

    // Draw table header
    doc.fontSize(8).font('Helvetica-Bold');
    let currentX = 20;
    cols.forEach((col, i) => {
      doc.rect(currentX, startY, colWidths[i], rowHeight).stroke();
      doc.text(col, currentX + 3, startY + 8, { width: colWidths[i] - 6, align: 'center' }); // Increased vertical padding
      currentX += colWidths[i];
    });

    // Opening Balance Row
    let currentY = startY + rowHeight;
    doc.fontSize(8).font('Helvetica');
    currentX = 20;

    const openingRowData = [
      '',
      openingBalance < 0 ? Math.abs(openingBalance).toFixed(2) : '',
      openingBalance > 0 ? openingBalance.toFixed(2) : '',
      openingBalance.toFixed(2),
      ''
    ];

    openingRowData.forEach((data, i) => {
      doc.rect(currentX, currentY, colWidths[i], rowHeight).stroke();
      doc.text(data, currentX + 3, currentY + 8, { width: colWidths[i] - 6, align: 'center' }); // Increased vertical padding
      currentX += colWidths[i];
    });

    let runningBalance = openingBalance;

    // Transaction Rows
    for (const transaction of transactions) {
      currentY += rowHeight;
      currentX = 20;
      const credit = transaction.type === 'credit' || transaction.type === 'opening' ? transaction.amount.toFixed(2) : '';
      const debit = transaction.type === 'debit' ? transaction.amount.toFixed(2) : '';
      runningBalance = transaction.balanceAfter;
      // Handle page break
      if (currentY > 780) { // Increased max Y to fit more on A4
        doc.addPage({ size: 'A4', margin: 20 });
        currentY = 20;

        // Redraw header on new page
        doc.fontSize(8).font('Helvetica-Bold');
        let headerX = 20;
        cols.forEach((col, i) => {
          doc.rect(headerX, currentY, colWidths[i], rowHeight).stroke();
          doc.text(col, headerX + 3, currentY + 8, { width: colWidths[i] - 6, align: 'center' }); // Increased vertical padding
          headerX += colWidths[i];
        });
        currentY += rowHeight;
        currentX = 20;
      }
      const rowData = [
        new Date(transaction.date).toLocaleDateString(),
        debit,
        credit,
        runningBalance.toFixed(2),
        transaction.kasar ? transaction.kasar.toFixed(2) : ''
      ];

      doc.fontSize(8).font('Helvetica');
      rowData.forEach((data, i) => {
        doc.rect(currentX, currentY, colWidths[i], rowHeight).stroke();
        const align = 'center';
        doc.text(data, currentX + 3, currentY + 8, { width: colWidths[i] - 6, align: align }); // Increased vertical padding
        currentX += colWidths[i];
      });
    }

    // Closing Balance Row
    currentY += rowHeight;
    currentX = 20;
    if (currentY > 780) { // Increased max Y to fit more on A4
      doc.addPage({ size: 'A4', margin: 20 });
      currentY = 20;
    }
    const closingBalance = transactions.length > 0 ? transactions[transactions.length - 1].balanceAfter : openingBalance;
    const closingRowData = [
      '',
      closingBalance < 0 ? Math.abs(closingBalance).toFixed(2) : '',
      closingBalance > 0 ? closingBalance.toFixed(2) : '',
      closingBalance.toFixed(2),
      ''
    ];

    doc.fontSize(8).font('Helvetica-Bold');
    closingRowData.forEach((data, i) => {
      doc.rect(currentX, currentY, colWidths[i], rowHeight).stroke();
      doc.text(data, currentX + 3, currentY + 8, { width: colWidths[i] - 6, align: 'center' }); // Increased vertical padding
      currentX += colWidths[i];
    });

    // Summary
    doc.moveDown(3); // Increased space before summary
    doc.fontSize(10).font('Helvetica-Bold').text('Summary:', 20);
    // reset
    detailY = doc.y 
    doc.fontSize(9).font('Helvetica');
    detailY += 12;
    doc.text(`Opening Balance: ₹${openingBalance}`, 20,detailY);
    detailY += 12;
    doc.text(`Closing Balance: ₹${closingBalance}`, 20,detailY);
    detailY += 12
    doc.text(`Total Transactions: ${transactions.length}`, 20,detailY);

    // Finalize the PDF
    doc.end();

  } catch (error) {
    console.error('Error generating ledger PDF:', error);
    res.status(500).json({ message: 'Error generating PDF', error: error.message });
  }
};


export { CreateCreditTransaction , generateLedgerPDF};
