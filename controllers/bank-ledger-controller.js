import PDFDocument from "pdfkit";
import { BankLedger } from "../models/Bank-ledger.js";
import Customer from "../models/Customer.js";
import Purchase from "../models/Purchase.js";
import Sales from "../models/Sales.js";
import Vendor from "../models/Vendor.js";
import { getFinancialYear } from "../utils/common.js";

const CreateCreditTransaction = async (req, res) => {
  try {
    const {
      userId,
      userType,
      amount,
      kasar = 0,
      invoices = [],
      date,
    } = req.body;

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

    const InvoiceEntity = userType === "Customer" ? Sales : Purchase;
    let remainingAmountToAllocate = Number(amount);
    let remainingKasarToAllocate = Number(kasar);
    const updatedInvoices = [];

    for (const invoice of invoices) {
      const invoiceDoc = await InvoiceEntity.findById(invoice.value);

      if (!invoiceDoc) {
        return res
          .status(404)
          .json({ message: `Invoice not found: ${invoice.value}` });
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
        const canAllocateKasar = Math.min(
          remainingKasarToAllocate,
          paidForThisInvoice
        );
        kasarForThisInvoice = canAllocateKasar;
        remainingKasarToAllocate -= canAllocateKasar;
      }

      invoiceDoc.payments.push({
        amount: paidForThisInvoice,
        date: new Date(),
        mode: "online",
        remarks: "Bank Transaction",
      });

      const newAmountPaid = Number(
        (alreadyPaidAmount + paidForThisInvoice).toFixed(2)
      );
      const newKasarAmount = Number(
        (Number(invoiceDoc.kasar || 0) + kasarForThisInvoice).toFixed(2)
      );
      const newPendingAmount = Number(
        (invoiceTotalAmount - newAmountPaid).toFixed(2)
      );

      invoiceDoc.amountPaid = newAmountPaid;
      invoiceDoc.kasar = newKasarAmount;
      invoiceDoc.pendingAmount = newPendingAmount;

      if (invoiceTotalAmount <= newAmountPaid + newKasarAmount) {
        invoiceDoc.status = "Paid";
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
      { $project: { balanceAfter: "$Transaction.balanceAfter" } },
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
      invoices: updatedInvoices,
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
      return res
        .status(400)
        .json({ message: "UserId and userType are required" });
    }

    // Fetch user details (Customer or Vendor)
    const UserModel = userType === "Customer" ? Customer : Vendor;
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
      transactions = transactions.filter((t) => {
        const txDate = new Date(t.date);
        return txDate >= new Date(startDate) && txDate <= new Date(endDate);
      });
    }

    if (financialYear) {
      transactions = transactions.filter(
        (t) => t.financialYear === financialYear
      );
    }

    // Sort transactions by date
    transactions.sort((a, b) => new Date(a.date) - new Date(b.date));

    // Calculate opening balance
    let openingBalance = 0;
    if (transactions.length > 0) {
      const firstTransaction = transactions[0];
      if (firstTransaction.type === "opening") {
        openingBalance = firstTransaction.amount;
      } else {
        // Calculate opening balance from previous transactions
        // This is a simplified calculation and might need to be more robust
        // depending on how 'balanceAfter' is calculated in your transactions.
        openingBalance =
          firstTransaction.balanceAfter -
          (firstTransaction.type === "credit"
            ? firstTransaction.amount
            : -firstTransaction.amount);
      }
    }

    // Create a new PDF document
    const doc = new PDFDocument({
      size: "A4",
      margin: 15, // Further reduced margin for more content space
    });

    // Set response headers
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=ledger-${
        userDetails.businessInformation.businessName
      }-${new Date().toISOString().split("T")[0]}.pdf`
    );

    // Pipe the PDF to response
    doc.pipe(res);

    // Company Header (Your Company Details)
    const companyName = "Ramdev Agro"; // Replace with your actual company name
    const companyAddress =
      "SURVEY NO 20, PAIKI PLOT NO 1, KHATA NO 736, AT- GALA,TA- DHRANGANDHRA, DIST- SURENDRANAGAR ,363310";
    const companyContact =
      "Phone: +91 94289 51404 | Email: Revabesanind@gmail.com";
    const companyGst = "GST Number: 24ABBFR5130N1Z6x";

    doc
      .fontSize(15)
      .font("Helvetica-Bold")
      .text(companyName, { align: "center" });
    doc.moveDown(0.2);
    doc
      .fontSize(10)
      .font("Helvetica")
      .text(companyAddress, { align: "center" });
    doc.moveDown(0.2);
    doc.text(companyContact, { align: "center" });
    doc.moveDown(0.2);
    doc.text(companyGst, { align: "center" });

    // Line separator
    doc
      .moveTo(15, doc.y + 10)
      .lineTo(580, doc.y + 10)
      .stroke(); // Adjusted line length to match reduced margins
    doc.moveDown(1.5);

    // Ledger Title
    doc
      .fontSize(14)
      .font("Helvetica-Bold")
      .text("BANK LEDGER", { align: "center" });
    doc.moveDown(0.5);

    // Customer/Vendor Details
    doc.fontSize(12).font("Helvetica-Bold").text(`${userType} Details:`, 20);
    doc.fontSize(8).font("Helvetica");

    const businessInfo = userDetails.businessInformation;
    const customerDetailsX = 25; // Increased horizontal position
    let detailY = doc.y;

    doc
      .fontSize(9)
      .text(
        `Business Name: ${businessInfo.businessName}`,
        customerDetailsX,
        detailY
      );
    detailY += 15; // Increased vertical spacing
    doc.text(
      `Name: ${userDetails.firstName} ${userDetails.lastName}`,
      customerDetailsX,
      detailY
    );
    detailY += 15;
    doc.text(`Contact: ${userDetails.contact}`, customerDetailsX, detailY);
    detailY += 15;
    doc.text(`Email: ${userDetails.email}`, customerDetailsX, detailY);
    detailY += 15;
    doc.text(
      `Address: ${businessInfo.Address}, ${businessInfo.city}, ${businessInfo.state} - ${businessInfo.pinCode}`,
      customerDetailsX,
      detailY
    );

    doc.moveDown(0.5);

    // Date Range
    if (startDate && endDate) {
      doc
        .fontSize(9)
        .font("Helvetica-Bold")
        .text(
          `Period: ${new Date(startDate).toLocaleDateString()} to ${new Date(
            endDate
          ).toLocaleDateString()}`,
          25
        );
    }
    if (financialYear) {
      doc.text(`Financial Year: ${financialYear}`, 20);
    }
    doc.moveDown(1);

    // Table Headers
    const startY = doc.y;
    const rowHeight = 30; // Increased row height for better spacing and readability
    // Adjusted column widths for A4 - removed Kasar and Remarks columns and fit to full page width
    const colWidths = [140, 140, 140, 140]; // Wider columns to fit full page
    const cols = ["Date", "Debit", "Credit", "Balance"]; // Removed 'Kasar' and 'Remarks' columns

    // Draw table header
    doc.fontSize(10).font("Helvetica-Bold"); // Increased font size
    let currentX = 20;
    cols.forEach((col, i) => {
      doc.rect(currentX, startY, colWidths[i], rowHeight).stroke();
      doc.text(col, currentX + 3, startY + 8, {
        width: colWidths[i] - 6,
        align: "center",
      }); // Increased vertical padding
      currentX += colWidths[i];
    });

    // Opening Balance Row
    let currentY = startY + rowHeight;
    doc.fontSize(10).font("Helvetica-Bold"); // Made opening balance row bold and increased font size
    currentX = 20;

    const openingRowData = [
      "Opening Balance",
      openingBalance < 0 ? Math.abs(openingBalance).toFixed(2) : "",
      openingBalance > 0 ? openingBalance.toFixed(2) : "",
      openingBalance.toFixed(2),
    ];

    openingRowData.forEach((data, i) => {
      doc.rect(currentX, currentY, colWidths[i], rowHeight).stroke();
      doc.text(data, currentX + 3, currentY + 8, {
        width: colWidths[i] - 6,
        align: "center",
      }); // Increased vertical padding
      currentX += colWidths[i];
    });

    let runningBalance = openingBalance;

    // Transaction Rows
    for (const transaction of transactions) {
      currentY += rowHeight;
      currentX = 20;
      const credit =
        transaction.type === "credit" || transaction.type === "opening"
          ? transaction.amount.toFixed(2)
          : "";
      const debit =
        transaction.type === "debit" ? transaction.amount.toFixed(2) : "";
      runningBalance = transaction.balanceAfter;
      // Handle page break
      if (currentY > 780) {
        // Increased max Y to fit more on A4
        doc.addPage({ size: "A4", margin: 20 });
        currentY = 20;

        // Redraw header on new page
        doc.fontSize(10).font("Helvetica-Bold"); // Increased font size
        let headerX = 20;
        cols.forEach((col, i) => {
          doc.rect(headerX, currentY, colWidths[i], rowHeight).stroke();
          doc.text(col, headerX + 3, currentY + 8, {
            width: colWidths[i] - 6,
            align: "center",
          }); // Increased vertical padding
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
      ];

      doc.fontSize(10).font("Helvetica"); // Increased font size for normal rows
      rowData.forEach((data, i) => {
        doc.rect(currentX, currentY, colWidths[i], rowHeight).stroke();
        const align = "center";
        doc.text(data, currentX + 3, currentY + 8, {
          width: colWidths[i] - 6,
          align: align,
        }); // Increased vertical padding
        currentX += colWidths[i];
      });
    }

    // Closing Balance Row
    currentY += rowHeight;
    currentX = 20;
    if (currentY > 780) {
      // Increased max Y to fit more on A4
      doc.addPage({ size: "A4", margin: 20 });
      currentY = 20;
    }
    const closingBalance =
      transactions.length > 0
        ? transactions[transactions.length - 1].balanceAfter
        : openingBalance;
    const closingRowData = [
      "Closing Balance",
      closingBalance < 0 ? Math.abs(closingBalance).toFixed(2) : "",
      closingBalance > 0 ? closingBalance.toFixed(2) : "",
      closingBalance.toFixed(2),
    ];

    doc.fontSize(10).font("Helvetica-Bold"); // Increased font size for closing balance
    closingRowData.forEach((data, i) => {
      doc.rect(currentX, currentY, colWidths[i], rowHeight).stroke();
      doc.text(data, currentX + 3, currentY + 8, {
        width: colWidths[i] - 6,
        align: "center",
      }); // Increased vertical padding
      currentX += colWidths[i];
    });

    // Finalize the PDF
    doc.end();
  } catch (error) {
    console.error("Error generating ledger PDF:", error);
    res
      .status(500)
      .json({ message: "Error generating PDF", error: error.message });
  }
};

const generateConsolidatedLedgerPDF = async (req, res) => {
  try {
    const { userType, startDate, endDate, financialYear } = req.query;

    if (!userType) {
      return res
        .status(400)
        .json({ message: "userType is required (Customer or Vendor)" });
    }

    const UserModel = userType === "Customer" ? Customer : Vendor;

    // Date handling logic (determining start and end dates)
    let start, end;
    if (!startDate || !endDate) {
      // Logic to find earliest/latest dates from transactions
      const earliestBankLedgerTxn = await BankLedger.aggregate([
        { $unwind: "$Transaction" },
        { $sort: { "Transaction.date": 1 } },
        { $limit: 1 },
        { $project: { date: "$Transaction.date" } },
      ]);

      const latestBankLedgerTxn = await BankLedger.aggregate([
        { $unwind: "$Transaction" },
        { $sort: { "Transaction.date": -1 } },
        { $limit: 1 },
        { $project: { date: "$Transaction.date" } },
      ]);

      const earliestSales = await Sales.findOne(
        {},
        { createdAt: 1 },
        { sort: { createdAt: 1 } }
      );
      const latestSales = await Sales.findOne(
        {},
        { createdAt: 1 },
        { sort: { createdAt: -1 } }
      );

      const earliestPurchases = await Purchase.findOne(
        {},
        { purchaseDate: 1 },
        { sort: { purchaseDate: 1 } }
      );
      const latestPurchases = await Purchase.findOne(
        {},
        { purchaseDate: 1 },
        { sort: { purchaseDate: -1 } }
      );

      const allDates = [
        earliestBankLedgerTxn[0]?.date,
        latestBankLedgerTxn[0]?.date,
        earliestSales?.createdAt,
        latestSales?.createdAt,
        earliestPurchases?.purchaseDate,
        latestPurchases?.purchaseDate,
      ]
        .filter(Boolean)
        .map((d) => new Date(d).getTime());

      if (allDates.length === 0) {
        return res.status(404).json({
          message:
            "No transaction data found to generate a consolidated ledger.",
        });
      }

      start = new Date(Math.min(...allDates));
      end = new Date(Math.max(...allDates));
    } else {
      start = new Date(startDate);
      end = new Date(endDate);

      if (isNaN(start.getTime()) || isNaN(end.getTime())) {
        return res.status(400).json({
          message:
            "Invalid date format. Please use a valid date string (e.g.,YYYY-MM-DD).",
        });
      }
    }

    const allUsers = await UserModel.find();

    if (!allUsers || allUsers.length === 0) {
      return res.status(404).json({ message: `No ${userType}s found` });
    }

    // Create PDF document
    const doc = new PDFDocument({
      size: "A4",
      margin: 15,
    });

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename=consolidated-date-based-${userType}-ledger-${
        new Date().toISOString().split("T")[0]
      }.pdf`
    );

    doc.pipe(res);

    // Add header information
    const companyName = "Ramdev Agro";
    const companyAddress =
      "SURVEY NO 20, PAIKI PLOT NO 1, KHATA NO 736, AT- GALA,TA- DHRANGANDHRA, DIST- SURENDRANAGAR ,363310";
    const companyContact =
      "Phone: +91 94289 51404 | Email: Revabesanind@gmail.com";
    const companyGst = "GST Number: 24ABBFR5130N1Z6x";

    doc
      .fontSize(15)
      .font("Helvetica-Bold")
      .text(companyName, { align: "center" });
    doc.moveDown(0.2);
    doc
      .fontSize(10)
      .font("Helvetica")
      .text(companyAddress, { align: "center" });
    doc.moveDown(0.2);
    doc.text(companyContact, { align: "center" });
    doc.moveDown(0.2);
    doc.text(companyGst, { align: "center" });

    doc
      .moveTo(15, doc.y + 10)
      .lineTo(580, doc.y + 10)
      .stroke();
    doc.moveDown(1.5);

    doc
      .fontSize(14)
      .font("Helvetica-Bold")
      .text(` ${userType.toUpperCase()} BANK LEDGER`, {
        align: "center",
      });
    doc.moveDown(0.5);

    let periodString = `Period: ${start.toLocaleDateString()} to ${end.toLocaleDateString()}`;
    if (financialYear) {
      periodString += ` | Financial Year: ${financialYear}`;
    }
    doc.fontSize(8).font("Helvetica-Bold").text(periodString, 20);
    doc.moveDown(1);

    // Gather all transactions and calculate balances
    let allConsolidatedTransactions = [];
    let userBalancesForPeriodStart = new Map(); // Stores balance for each user at the start of the period

    // Process each user to get their transactions and balances
    for (const user of allUsers) {
      let totalDebit = 0;
      let totalCredit = 0;

      const userId = user._id;
      const businessName = user.businessInformation.businessName;

      // Find the bank ledger for this user
      const bankLedger = await BankLedger.findOne({ userId, userType });

      if (
        !bankLedger ||
        !bankLedger.Transaction ||
        bankLedger.Transaction.length === 0
      ) {
        continue;
      }

      // Calculate the opening balance for this user for the specified period
      let currentRunningBalance = 0;
      let transactionsBeforePeriod = bankLedger.Transaction.filter(
        (t) => new Date(t.date) < start
      );

      // Sort transactions before the period to get the true last balance
      transactionsBeforePeriod.sort(
        (a, b) => new Date(a.date) - new Date(b.date)
      );

      if (transactionsBeforePeriod.length > 0) {
        currentRunningBalance =
          transactionsBeforePeriod[transactionsBeforePeriod.length - 1]
            .balanceAfter;
      } else {
        const firstTransactionOverall = bankLedger.Transaction.sort(
          (a, b) => new Date(a.date) - new Date(b.date)
        )[0];
        if (
          firstTransactionOverall &&
          firstTransactionOverall.type === "opening" &&
          new Date(firstTransactionOverall.date) >= start
        ) {
          currentRunningBalance = firstTransactionOverall.amount;
        } else {
          currentRunningBalance = 0;
        }
      }

      userBalancesForPeriodStart.set(userId.toString(), currentRunningBalance);

      // Filter transactions that fall within the requested period (inclusive)
      let transactionsInPeriod = bankLedger.Transaction.filter((t) => {
        const txDate = new Date(t.date);
        return txDate >= start && txDate <= end;
      });

      if (financialYear) {
        transactionsInPeriod = transactionsInPeriod.filter(
          (t) => t.financialYear === financialYear
        );
      }

      // Add all valid transactions to our consolidated list
      transactionsInPeriod.forEach((transaction) => {
        if (transaction.type === "credit" || transaction.type === "debit") {
          allConsolidatedTransactions.push({
            ...transaction.toObject(),
            userId: userId.toString(),
            businessName: businessName,
          });

          if (transaction.type === "credit") totalCredit += transaction.amount;
          if (transaction.type === "debit") totalDebit += transaction.amount;
        }
      });
    }

    // Sort all transactions by date
    allConsolidatedTransactions.sort(
      (a, b) => new Date(a.date) - new Date(b.date)
    );

    if (
      allConsolidatedTransactions.length === 0 &&
      Array.from(userBalancesForPeriodStart.values()).every(
        (balance) => balance === 0
      )
    ) {
      return res.status(404).json({
        message: "No relevant transactions found for the specified criteria.",
      });
    }

    // --- PDF Table Layout ---
    const startY = doc.y;
    const rowHeight = 20;
    const tableWidth = doc.page.width - 30;
    const colWidths = [63, 158, 109, 109, 122];
    const cols = [
      "Date",
      "Business Name",
      "Debit (INR)",
      "Credit (INR)",
      "Balance (INR)",
    ];

    // Draw header row
    doc.fontSize(10).font("Helvetica-Bold");
    let currentX = 15;
    cols.forEach((col, i) => {
      doc.rect(currentX, startY, colWidths[i], rowHeight).stroke();
      doc.text(col, currentX + 3, startY + 6, {
        width: colWidths[i] - 6,
        align: "center",
      });
      currentX += colWidths[i];
    });

    let currentY = startY + rowHeight;
    let runningBalancesPerUser = new Map(userBalancesForPeriodStart);

    doc.font("Helvetica").fontSize(9);

    for (const txn of allConsolidatedTransactions) {
      const { date, userId, businessName, type, amount } = txn;

      let debit = "";
      let credit = "";

      if (type === "debit") {
        debit = amount.toFixed(2);
        runningBalancesPerUser.set(
          userId,
          (runningBalancesPerUser.get(userId) || 0) - amount
        );
      } else if (type === "credit") {
        credit = amount.toFixed(2);
        runningBalancesPerUser.set(
          userId,
          (runningBalancesPerUser.get(userId) || 0) + amount
        );
      }

      const balance = runningBalancesPerUser.get(userId).toFixed(2);

      const rowData = [
        new Date(date).toLocaleDateString(),
        businessName,
        debit,
        credit,
        balance,
      ];

      let currentX = 15;
      for (let i = 0; i < cols.length; i++) {
        doc.rect(currentX, currentY, colWidths[i], rowHeight).stroke();
        doc.text(rowData[i], currentX + 3, currentY + 6, {
          width: colWidths[i] - 6,
          align: "center",
        });
        currentX += colWidths[i];
      }

      currentY += rowHeight;

      // Add new page if needed
      if (currentY + rowHeight > doc.page.height - 50) {
        doc.addPage();
        currentY = 15;

        // Redraw table header on new page
        doc.fontSize(9).font("Helvetica-Bold");
        currentX = 15;
        for (let i = 0; i < cols.length; i++) {
          doc.rect(currentX, currentY, colWidths[i], rowHeight).stroke();
          doc.text(cols[i], currentX + 3, currentY + 6, {
            width: colWidths[i] - 6,
            align: "center",
          });
          currentX += colWidths[i];
        }
        currentY += rowHeight;
        doc.fontSize(8).font("Helvetica");
      }
    }
    doc.addPage();
    doc.fontSize(14).font("Helvetica-Bold").text("Ledger Summary Per User", {
      align: "center",
    });
    doc.moveDown(1);

    // Table headers
    const summaryCols = [
      "Business Name",
      "Opening",
      "Debit",
      "Credit",
      "Closing",
    ];
    const summaryColWidths = [180, 100, 80, 80, 100];
    const summaryRowHeight = 20;

    let x = 15;
    let y = doc.y;
    doc.fontSize(10).font("Helvetica-Bold");
    summaryCols.forEach((col, i) => {
      doc.rect(x, y, summaryColWidths[i], summaryRowHeight).stroke();
      doc.text(col, x + 3, y + 6, {
        width: summaryColWidths[i] - 6,
        align: "center",
      });
      x += summaryColWidths[i];
    });

    y += summaryRowHeight;
    doc.fontSize(9).font("Helvetica");

    // Loop over users to print summaries
    for (const user of allUsers) {
      const userId = user._id.toString();
      const businessName = user.businessInformation.businessName;
      const opening = userBalancesForPeriodStart.get(userId) || 0;

      // Get all txns of this user from consolidated list
      const userTxns = allConsolidatedTransactions.filter(
        (t) => t.userId === userId
      );

      let debit = 0;
      let credit = 0;

      userTxns.forEach((t) => {
        if (t.type === "debit") debit += t.amount;
        if (t.type === "credit") credit += t.amount;
      });

      const closing = opening - debit + credit;

      const rowData = [
        businessName,
        opening.toFixed(2),
        debit.toFixed(2),
        credit.toFixed(2),
        closing.toFixed(2),
      ];

      x = 15;
      for (let i = 0; i < rowData.length; i++) {
        doc.rect(x, y, summaryColWidths[i], summaryRowHeight).stroke();
        doc.text(rowData[i], x + 3, y + 6, {
          width: summaryColWidths[i] - 6,
          align: "center",
        });
        x += summaryColWidths[i];
      }

      y += summaryRowHeight;

      // Add new page if needed
      if (y + summaryRowHeight > doc.page.height - 50) {
        doc.addPage();
        y = 15;

        doc.fontSize(10).font("Helvetica-Bold");
        x = 15;
        summaryCols.forEach((col, i) => {
          doc.rect(x, y, summaryColWidths[i], summaryRowHeight).stroke();
          doc.text(col, x + 3, y + 6, {
            width: summaryColWidths[i] - 6,
            align: "center",
          });
          x += summaryColWidths[i];
        });
        y += summaryRowHeight;
        doc.font("Helvetica").fontSize(9);
      }
    }

    doc.end(); // Finalize the PDF and send the response
  } catch (error) {
    console.error("Error generating consolidated ledger PDF:", error);
    res.status(500).json({ message: "Internal server error", error });
  }
};

export {
  CreateCreditTransaction,
  generateConsolidatedLedgerPDF,
  generateLedgerPDF,
};
