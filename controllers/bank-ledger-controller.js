import { BankLedger } from "../models/Bank-ledger.js";
import Purchase from "../models/Purchase.js";
import Sales from "../models/Sales.js";
import { getFinancialYear } from "../utils/common.js";

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

export { CreateCreditTransaction };
