import { v4 as uuidv4 } from "uuid";
import Product from "../models/Product.js";
import Sales from "../models/Sales.js";

const determineStatus = (amountPaid, totalAmount, dueDate) => {
  if (amountPaid >= totalAmount) return "Paid";
  if (new Date() > new Date(dueDate)) return "Overdue";
  return "Pending";
};

const generateUniqueInvoiceNumber = async () => {
  let invoiceNumber;
  let isUnique = false;

  while (!isUnique) {
    invoiceNumber = `INV-${uuidv4().split("-")[0]}`;
    const existingSale = await Sales.findOne({ invoiceNumber });
    if (!existingSale) {
      isUnique = true;
    }
  }

  return invoiceNumber;
};

const addSale = async (req, res) => {
  try {
    const {
      customerId,
      items,
      gstPercentage,
      dueDate,
      isPaymentDone,
      paymentAmount,
      salesperson,
    } = req.body;

    if (!items || items.length === 0) {
      return res.status(400).json({ error: "At least one item is required" });
    }

    // Fetch product prices from the database
    const productDetails = await Product.find({
      _id: { $in: items.map((item) => item.productId) },
    });

    if (productDetails.length !== items.length) {
      return res.status(400).json({ error: "One or more products not found" });
    }

    // Calculate subtotal, GST amount, and total amount
    let subtotal = 0;

    const processedItems = items.map((item) => {
      const product = productDetails.find(
        (p) => p._id.toString() === item.productId
      );
      if (!product) {
        throw new Error(`Product not found: ${item.productId}`);
      }
      const total = item.price * item.quantity;
      subtotal += total;

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
      isPaymentDone && // Check if payment is done
      paymentAmount >= subtotal && // Ensure payment amount covers the subtotal
      receivedDate &&
      receivedDate < due // Check if payment date is before due date
    ) {
      earlyPaymentDiscount = subtotal * 0.02; // Apply 2% discount
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

    // Generate unique invoice number
    const invoiceNumber = await generateUniqueInvoiceNumber();
    const pendingAmount = totalAmount - amountPaid;
    // Create sale record
    const sale = new Sales({
      invoiceNumber,
      customerId,
      items: processedItems,
      subtotal,
      earlyPaymentDiscount,
      gstPercentage,
      gstAmount,
      cgst,
      sgst,
      totalAmount,
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

    await sale.save();
    await sale.populate(["customerId", "items.productId"]); // Populating customer and product details

    res.status(201).json(sale);
  } catch (error) {
    res.status(400).json({ error: error.message });
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

export { addPaymentToSale, addSale, getSale, getSales };
