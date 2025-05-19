import mongoose from "mongoose";
import Product from "../models/Product.js";
import Sales from "../models/Sales.js";
import Stock from "../models/Stock.js";
import { calculateBalanceAfter, getFinancialYear } from '../utils/common.js'
import { BankLedger } from "../models/Bank-ledger.js";

const determineStatus = (amountPaid, totalAmount, dueDate) => {
  if (amountPaid >= totalAmount) return "Paid";
  if (new Date() > new Date(dueDate)) return "Overdue";
  return "Pending";
};

const addSale = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const {
      customerId,
      items,
      gstPercentage,
      dueDate,
      createDate,
      isPaymentDone,
      paymentAmount,
      salesperson,
      invoiceNumber,
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "At least one item is required" });
    }

    const uniqueProductIds = [...new Set(items.map((item) => item.productId))];

    const productDetails = await Product.find({
      _id: { $in: uniqueProductIds },
    }).session(session);

    if (productDetails.length !== uniqueProductIds.length) {
      return res.status(400).json({ error: "One or more products not found" });
    }

    let subtotal = 0;

    const processedItems = items.map((item) => {
      const product = productDetails.find(
        (p) => p._id.toString() === item.productId
      );
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }
      const total = parseFloat((item.price * item.quantity).toFixed(2));
      subtotal += total;

      updateStock(product, item, session);

      return {
        productId: item.productId,
        price: item.price,
        quantity: item.quantity,
        bag: item.bag,
        total,
        name: item.name,
        weight: item.weight,
        totalweight: item.totalweight,
        bagsize: item.bagsize,
        unit: item.unit,
        hsnCode: product.HSNCode,
      };
    });

    const receivedDate = isPaymentDone ? new Date() : null;
    const due = new Date(dueDate);

    let earlyPaymentDiscount = 0;
    if (
      isPaymentDone &&
      paymentAmount >= subtotal &&
      receivedDate &&
      receivedDate < due
    ) {
      earlyPaymentDiscount = subtotal * 0.02;
    }

    const gstBase = subtotal - earlyPaymentDiscount;
    const gstAmount = (gstBase * gstPercentage) / 100;
    const cgst = gstAmount / 2;
    const sgst = gstAmount / 2;
    const totalAmount = gstBase + gstAmount;

    let commissionAmount = 0;
    if (salesperson?.commissionPercentage) {
      commissionAmount = (gstBase * salesperson.commissionPercentage) / 100;
    }

    const payments = [];
    let amountPaid = 0;
    let isFullyPaid = false;

    if (isPaymentDone && paymentAmount > 0) {
      payments.push({
        amount: paymentAmount,
        date: receivedDate,
        mode: "initial",
        remarks: "Initial payment",
      });

      amountPaid = paymentAmount;
    }

    isFullyPaid = amountPaid >= totalAmount;
    const status = determineStatus(amountPaid, totalAmount, dueDate);

    const pendingAmount = totalAmount - amountPaid;

    const sale = new Sales({
      invoiceNumber: invoiceNumber,
      customerId,
      items: processedItems,
      subtotal,
      earlyPaymentDiscount,
      gstPercentage,
      gstAmount,
      cgst,
      sgst,
      totalAmount,
      createdAt:createDate,
      dueDate,
      payments,
      amountPaid,
      pendingAmount,
      isFullyPaid,
      salesperson: {
        name: salesperson?.name || "",
        commissionPercentage: salesperson?.commissionPercentage || 0,
        commissionAmount,
      },
      status,
    });

    await sale.save({ session });
    await sale.populate(["customerId", "items.productId"]);

    let transactionType = 'credit'
    const existingBankLedger = await BankLedger.findOne({
      userId: customerId,
      userType: "Customer",
    }).session(session);

    if (!existingBankLedger || existingBankLedger.Transaction.length === 0) 
    {
      transactionType = "opening";
    }

    const financialYear = getFinancialYear();

    const newBankLedgerTransaction = {
      type: transactionType,
      amount: totalAmount, 
      kasar: 0,
      invoices: [
        {
          invoiceId: sale._id,
          invoiceType: "Sales",
          paidAmount: amountPaid,
        },
      ],
      balanceAfter: await calculateBalanceAfter(customerId, "Customer", amountPaid, transactionType, session , totalAmount), // You need this
      finanacialYear: financialYear,
      date: createDate,
    };

    if (existingBankLedger) {
      existingBankLedger.Transaction.push(newBankLedgerTransaction);
      await existingBankLedger.save({ session });
    } else {
      const newBankLedger = new BankLedger({
        userId: customerId,
        userType: "Customer",
        Transaction: [newBankLedgerTransaction],
      });
      await newBankLedger.save({ session });
    }

    await session.commitTransaction();
    res.status(201).json(sale);
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

const updateStock = async (product, item, session) => {
  try {
    // Update Stock record for the product
    const stock = await Stock.findOne({ productId: product._id }).session(
      session
    );
    
    if (stock) {
      // Decrease the stock quantity
      stock.quantity -= item.quantity;
      stock.history.push({
        change: item.quantity,
        reason: "Sale",
        changeType: "STOCK OUT",
        bags:[{
                  size: item.bagsize,
                  quantity: item.quantity,
                  weight: item.weight
              }],
      });

      // Save the stock changes
      await stock.save({ session });
    }

    // Update the product's stock
    product.stock -= item.quantity;
    product.totalWeight = parseFloat(product.weight) * product.stock;

    // Save the product changes
    await product.save({ session });
  } catch (error) {
    console.error("Error updating stock:", error.message);
  }
};

const getSales = async (req, res) => {
  try {
    const sales = await Sales.find().populate("customerId");

    const formattedSales = sales.map((sale) => ({
      _id: sale._id,
      invoiceNumber: sale.invoiceNumber,
      customerName: `${sale.customerId?.firstName || ""} ${
        sale.customerId?.lastName || ""
      }`.trim(),
      createDate: sale.createdAt,
      dueDate: sale.dueDate,
      subtotal: sale.subtotal,
      earlyPaymentDiscount: sale.earlyPaymentDiscount,
      gstAmount: sale.gstAmount,
      totalAmount: sale.totalAmount,
      amountPaid: sale.amountPaid,
      pendingAmount: sale.pendingAmount,
      isFullyPaid: sale.isFullyPaid,
      salespersonName: sale.salesperson?.name || "",
      status: sale.status,
      gstPercentage: sale.gstPercentage,
    }));

    res.status(200).json({ sales: formattedSales });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getSale = async (req, res) => {
  try {
    const saleId = req.params.id;
    let sale = await Sales.findById(saleId)
      .populate("items.productId")
      .populate("customerId");

    if (!sale) {
      return res.status(404).json({ error: "Sale not found" });
    }

    sale = sale.toObject();

    const customer = sale.customerId;

    const formattedSale = {
      _id: sale._id,
      invoiceNumber: sale.invoiceNumber,
      createDate: sale.createdAt,
      dueDate: sale.dueDate,
      subtotal: sale.subtotal,
      earlyPaymentDiscount: sale.earlyPaymentDiscount,
      gstPercentage: sale.gstPercentage,
      gstAmount: sale.gstAmount,
      cgst: sale.cgst,
      sgst: sale.sgst,
      totalAmount: sale.totalAmount,
      amountPaid: sale.amountPaid || 0,
      pendingAmount: sale.pendingAmount || 0,
      isFullyPaid: sale.isFullyPaid || false,
      items: sale.items.map((item) => ({
        productId: item.productId._id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        total: item.total,
        bag: item.bag,
        weight: item.weight,
        totalweight: item.totalweight,
        bagsize: item.bagsize,
        unit: item.unit,
        hsnCode: item.hsnCode,
      })),
      user: {
        name: `${customer?.firstName || ""} ${customer?.lastName || ""}`.trim(),
        fullAddress: `${customer?.shippingAddress?.Address || ""}, ${
          customer?.shippingAddress?.city || ""
        }, ${customer?.shippingAddress?.state || ""}, ${
          customer?.shippingAddress?.country || ""
        } - ${customer?.shippingAddress?.pinCode || ""}`,
        phoneNumber: customer?.contact || "",
        businessName: customer?.businessInformation?.businessName || "",
        businessFullAddress: `${
          customer?.businessInformation?.Address || ""
        }, ${customer?.businessInformation?.city || ""}, ${
          customer?.businessInformation?.state || ""
        }, ${customer?.businessInformation?.country || ""} - ${
          customer?.businessInformation?.pinCode || ""
        }`,
        gstNumber: customer?.businessInformation?.gstNumber || "",
      },
      salesperson: {
        name: sale.salesperson?.name || "",
        commissionPercentage: sale.salesperson?.commissionPercentage || 0,
        commissionAmount: sale.salesperson?.commissionAmount || 0,
      },
      isPaymentReceived: sale.isPaymentReceived,
      paymentReceivedDate: sale.paymentReceivedDate,
      payments: sale.payments || [],
      status: sale.status,
    };

    res.status(200).json({ sale: formattedSale });
  } catch (error) {
    console.error("Error fetching sale:", error);
    res.status(500).json({ error: error.message });
  }
};

const addPaymentToSale = async (req, res) => {
  try {
    const saleId = req.params.id;
    const { amount, mode, remarks, date } = req.body;

    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ error: "Valid payment amount is required." });
    }

    const sale = await Sales.findById(saleId);
    if (!sale) {
      return res.status(404).json({ error: "Sale not found." });
    }

    // Validate that the total payments do not exceed the total amount
    const totalPaidAfterThisPayment = sale.amountPaid + amount;
    if (totalPaidAfterThisPayment > sale.totalAmount + 10) {
      return res
        .status(400)
        .json({ error: "Payment amount exceeds the total amount." });
    }

    // Add new payment
    const newPayment = {
      amount,
      date: new Date(date),
      mode,
      remarks,
    };
    sale.payments.push(newPayment);

    // Recalculate total amount paid
    const amountPaid = sale.payments.reduce((sum, p) => sum + p.amount, 0);
    const pendingAmount = sale.totalAmount - amountPaid;
    const isFullyPaid = amountPaid >= sale.totalAmount;

    // Update sale document
    sale.amountPaid = amountPaid;
    sale.isFullyPaid = isFullyPaid;
    sale.status = determineStatus(amountPaid, sale.totalAmount, sale.dueDate);
    sale.pendingAmount = pendingAmount;

    if (sale.status === "Paid" && new Date() <= new Date(sale.dueDate)) {
      sale.earlyPaymentDiscount = sale.totalAmount * 0.02; // Apply 2% discount
      // also need to do further calculation for correct update
      const gstBase = sale.subtotal - sale.earlyPaymentDiscount;
      const gstAmount = (gstBase * sale.gstPercentage) / 100;
      sale.gstAmount = gstAmount;
      sale.cgst = gstAmount / 2;
      sale.sgst = gstAmount / 2;
      sale.totalAmount = gstBase + gstAmount;
    }
    await sale.save();
    await sale.populate(["customerId", "items.productId"]);

    res.status(200).json({ message: "Payment added successfully.", sale });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const updateSale = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const saleId = req.params.id;
    const {
      items,
      gstPercentage,
      dueDate,
      isPaymentDone,
      paymentAmount,
      salesperson,
      invoiceNumber,
    } = req.body;

    const sale = await Sales.findById(saleId).session(session);
    if (!sale) {
      throw new Error("Sale not found");
    }

    // 1. Revert previous stock
    for (const item of sale.items) {
      const product = await Product.findById(item.productId).session(session);
      if (product) {
        product.stock += item.quantity;
        await product.save({ session });
      }
    }

    // 2. Validate new items
    const uniqueProductIds = [...new Set(items.map((item) => item.productId))];
    const productDetails = await Product.find({
      _id: { $in: uniqueProductIds },
    }).session(session);
    if (productDetails.length !== uniqueProductIds.length) {
      throw new Error("One or more new products not found");
    }

    // 3. Process new items
    let subtotal = 0;
    const processedItems = items.map((item) => {
      const product = productDetails.find(
        (p) => p._id.toString() === item.productId
      );
      if (!product) throw new Error(`Product not found: ${item.productId}`);
      const total = parseFloat((item.price * item.quantity).toFixed(2));
      subtotal += total;

      updateStock(product, item, session); // Deduct new stock
      return {
        productId: item.productId,
        price: item.price,
        quantity: item.quantity,
        bag: item.bag,
        total,
        name: item.name,
        weight: item.weight,
        totalweight: item.totalweight,
        bagsize: item.bagsize,
        unit: item.unit,
        hsnCode: product.HSNCode,
      };
    });

    // 4. Recalculate
    const receivedDate = isPaymentDone ? new Date() : null;
    const due = new Date(dueDate);
    let earlyPaymentDiscount = 0;
    if (isPaymentDone && paymentAmount >= subtotal && receivedDate < due) {
      earlyPaymentDiscount = subtotal * 0.02;
    }

    const gstBase = subtotal - earlyPaymentDiscount;
    const gstAmount = (gstBase * gstPercentage) / 100;
    const cgst = gstAmount / 2;
    const sgst = gstAmount / 2;
    const totalAmount = gstBase + gstAmount;
    const pendingAmount = totalAmount - paymentAmount;

    let commissionAmount = 0;
    if (salesperson?.commissionPercentage) {
      commissionAmount = (gstBase * salesperson.commissionPercentage) / 100;
    }

    const payments = [];
    if (isPaymentDone && paymentAmount > 0) {
      payments.push({
        amount: paymentAmount,
        date: receivedDate,
        mode: "updated",
        remarks: "Updated payment",
      });
    }

    const isFullyPaid = paymentAmount >= totalAmount;
    const status = determineStatus(paymentAmount, totalAmount, dueDate);

    // 5. Update Sale
    sale.items = processedItems;
    sale.invoiceNumber = invoiceNumber;
    sale.subtotal = subtotal;
    sale.earlyPaymentDiscount = earlyPaymentDiscount;
    sale.gstPercentage = gstPercentage;
    sale.gstAmount = gstAmount;
    sale.cgst = cgst;
    sale.sgst = sgst;
    sale.totalAmount = totalAmount;
    sale.dueDate = dueDate;
    sale.payments = payments;
    sale.amountPaid = paymentAmount;
    sale.pendingAmount = pendingAmount;
    sale.isFullyPaid = isFullyPaid;
    sale.salesperson = {
      name: salesperson?.name || "",
      commissionPercentage: salesperson?.commissionPercentage || 0,
      commissionAmount,
    };
    sale.status = status;

    await sale.save({ session });
    await sale.populate(["customerId", "items.productId"]);
    await session.commitTransaction();
    res.status(200).json(sale);
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

const deleteSale = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const saleId = req.params.id;

    const sale = await Sales.findById(saleId).session(session);
    if (!sale) {
      throw new Error("Sale not found");
    }

    for (const item of sale.items) {
      const product = await Product.findById(item.productId).session(session);
      if (product) {
        product.stock += item.quantity;
        product.totalWeight = parseFloat(product.weight) * product.stock;
        await product.save({ session });
      }
    }

    await sale.deleteOne({ session });
    await session.commitTransaction();
    res.status(200).json({ message: "Sale deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

const getSaleInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Sales.findById(id)
      .populate("customerId") // Populate customer details for invoiceTo
      .populate("items.productId"); // Optional: populate product info if needed

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    // Transform to frontend expected format
    const transformed = {
      _id: invoice._id,
      invoiceNumber: invoice.invoiceNumber,
      createDate: invoice.createdAt,
      dueDate: invoice.dueDate,
      invoiceTo: invoice.customerId, // entire customer object (should match your frontend structure)
      items: invoice.items.map((item) => ({
        product: item.productId._id,
        name: item.name,
        quantity: item.quantity,
        price: item.price,
        weight: item.weight,
        totalweight: item.totalweight,
        bag: item.bag,
        total: item.total,
        bagsize: item.bagsize,
        unit: item.unit,
        hsnCode: item.hsnCode,
      })),
      gstPercentage: invoice.gstPercentage,
      gstAmount: invoice.gstAmount,
      totalAmount: invoice.totalAmount,
      salesMenName: invoice.salesperson?.name || "",
      salesCommision: invoice.salesperson?.commissionPercentage || 0,
      isInitialPayment: invoice.amountPaid > 0,
      initialPayment: invoice.amountPaid,
    };

    res.json({ sale: transformed });
  } catch (error) {
    console.error("Error fetching invoice:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

const getSaleLastInvoiceNumber = async (req, res) => {
  try {
    const lastInvoice = await Sales.findOne(
      {},
      {},
      { sort: { createdAt: -1 } }
    );
    if (!lastInvoice) {
      return res.status(404).json({ message: "No invoices found" });
    }
    res.status(200).json({ invoiceNumber: lastInvoice.invoiceNumber });
  } catch (error) {
    console.error("Error fetching last invoice number:", error);
    res.status(500).json({ message: "Server Error" });
  }
};


const getSalesByCustomerId = async (req,res)=>{
  try{
    const {customerId} = req.params
    if (!customerId) {
      return res.status(400).json({ message: "Invalid customerId" });
    }  
  
    const salesSummary = await Sales.aggregate([
      {
        $match:{
          customerId:new mongoose.Types.ObjectId(customerId),
          status:{$ne:'Paid'}
        }
      },
      {
        $facet:{
          summary:[
            {
              $group:{
                _id:null,
                totalAmount:{$sum:'$totalAmount'},
                totalpendingAmount:{$sum:'$pendingAmount'}
              }
            }
          ],
          invoiceDetails:[
            {
              $project:{
                _id:1,
                invoiceNumber:1,
                totalAmount:1,
                pendingAmount:1,
              }
            }
          ]
        }
      }
    ])

    const modifiedSummary = salesSummary[0] || {};
    modifiedSummary.summary = modifiedSummary.summary?.[0] || {};

    res.status(200).json({transactionSummary:modifiedSummary})
  }catch(error){
    console.log(error)
    req.status(500).json({message:"Server Error"})
  }
}

export {
  addPaymentToSale,
  addSale,
  deleteSale,
  getSale,
  getSaleInvoiceById,
  getSaleLastInvoiceNumber,
  getSales,
  updateSale,
  getSalesByCustomerId
};
