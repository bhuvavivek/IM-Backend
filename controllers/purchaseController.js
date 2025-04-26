import { v4 as uuidv4 } from "uuid";
import Product from "../models/Product.js";
import Purchase from "../models/Purchase.js";

const determineStatus = (amountSent, totalAmount, dueDate) => {
  if (amountSent >= totalAmount) return "Paid";
  if (new Date() > new Date(dueDate)) return "Overdue";
  return "Pending";
};

const generateUniqueInvoiceNumber = async () => {
  let invoiceNumber;
  let isUnique = false;

  while (!isUnique) {
    invoiceNumber = `INV-${uuidv4().split("-")[0]}`;
    const existingSale = await Purchase.findOne({ invoiceNumber });
    if (!existingSale) {
      isUnique = true;
    }
  }

  return invoiceNumber;
};

const addPurchase = async (req, res) => {
  try {
    const {
      vendorId,
      items,
      gstPercentage,
      dueDate,
      isPaymentDone,
      paymentAmount,
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
      };
    });
    const paymentSendDate = isPaymentDone ? new Date() : null;

    const gstAmount = (subtotal * gstPercentage) / 100;
    const totalAmount = subtotal + gstAmount;
    const cgst = gstAmount / 2;
    const sgst = gstAmount / 2;

    const payments = [];
    let amountSent = 0;
    let isFullyPaid = false;

    if (isPaymentDone && paymentAmount > 0) {
      payments.push({
        amount: paymentAmount,
        date: paymentSendDate,
        mode: "initial",
        remarks: "Initial payment",
      });

      amountSent = paymentAmount;
    }

    isFullyPaid = amountSent >= totalAmount;
    const status = determineStatus(amountSent, totalAmount, dueDate);

    // Generate unique invoice number
    const invoiceNumber = await generateUniqueInvoiceNumber();
    const pendingAmount = totalAmount - amountSent;

    // Create purchase record
    const purchase = new Purchase({
      invoiceNumber,
      vendorId,
      items: processedItems,
      subtotal,
      gstPercentage,
      gstAmount,
      cgst,
      sgst,
      totalAmount,
      purchaseDate: dueDate,
      payments,
      amountPaid: amountSent,
      pendingAmount,
      isFullyPaid,
      status,
      paymentSendDate,
    });

    await purchase.save();
    await purchase.populate(["vendorId", "items.productId"]); // Populating customer and product details

    res.status(201).json(purchase);
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getPurchases = async (req, res) => {
  try {
    const purchases = await Purchase.find().populate("vendorId");

    const formattedPurchase = purchases.map((purchase) => ({
      _id: purchase._id,
      invoiceNumber: purchase.invoiceNumber,
      vendorName: `${purchase.vendorId?.firstName || ""} ${
        purchase.vendorId?.lastName || ""
      }`.trim(),
      createDate: purchase.createdAt,
      dueDate: purchase.purchaseDate,
      subtotal: purchase.subtotal,
      gstAmount: purchase.gstAmount,
      totalAmount: purchase.totalAmount,
      amountPaid: purchase.amountPaid,
      pendingAmount: purchase.pendingAmount,
      isFullyPaid: purchase.isFullyPaid,
      paymentSendDate: purchase.paymentSendDate,
      status: purchase.status,
      gstPercentage: purchase.gstPercentage,
    }));

    res.status(200).json({ purchases: formattedPurchase });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getPurchase = async (req, res) => {
  try {
    const PurchaseId = req.params.id;
    let purchase = await Purchase.findById(PurchaseId)
      .populate("vendorId")
      .populate("items.productId");

    if (!purchase) {
      return res.status(404).json({ error: "Purchase not found" });
    }

    purchase = purchase.toObject();

    const vendor = purchase.vendorId;
    const formattedPurchase = {
      _id: purchase._id,
      invoiceNumber: purchase.invoiceNumber,
      createDate: purchase.createdAt,
      dueDate: purchase.purchaseDate,
      subtotal: purchase.subtotal,
      gstPercentage: purchase.gstPercentage,
      gstAmount: purchase.gstAmount,
      cgst: purchase.cgst,
      sgst: purchase.sgst,
      totalAmount: purchase.totalAmount,
      amountPaid: purchase.amountPaid,
      pendingAmount: purchase.pendingAmount,
      isFullyPaid: purchase.isFullyPaid || false,
      items: purchase.items.map((item) => ({
        productId: item.productId,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        bag: item.bag,
        total: item.total,
        weight: item.weight,
        totalweight: item.totalweight,
        bagsize: item.bagsize,
      })),
      user: {
        name: `${vendor.firstName || ""}  ${vendor.lastName || ""}`.trim(),
        fullAddress: `${vendor?.shippingAddress?.Address || ""}, ${
          vendor?.shippingAddress?.city || ""
        }, ${vendor?.shippingAddress?.state || ""}, ${
          vendor?.shippingAddress?.country || ""
        } - ${vendor?.shippingAddress?.pinCode || ""}`,
        phoneNumber: vendor?.contact || "",
      },
      paymentSendDate: purchase.paymentSendDate,
      payments: purchase.payments,
      status: purchase.status,
    };
    res.status(200).json({ purchase: formattedPurchase });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const addPaymentToPurchase = async (req, res) => {
  try {
    const purchaseId = req.params.id;
    const { amount, mode, remarks, date } = req.body;

    if (!amount || amount <= 0) {
      return res
        .status(400)
        .json({ error: "Valid payment amount is required." });
    }

    const purchase = await Purchase.findById(purchaseId);
    if (!purchase) {
      return res.status(404).json({ error: "Purchase not found." });
    }

    // Validate that the total payments do not exceed the total amount
    const totalPaidAfterThisPayment = purchase.amountPaid + amount;
    if (totalPaidAfterThisPayment > purchase.totalAmount + 10) {
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
    purchase.payments.push(newPayment);

    // Recalculate total amount paid
    const amountPaid = purchase.payments.reduce((sum, p) => sum + p.amount, 0);
    const pendingAmount = purchase.totalAmount - amountPaid;
    const isFullyPaid = amountPaid >= purchase.totalAmount;

    // Update purchase document
    purchase.amountPaid = amountPaid;
    purchase.isFullyPaid = isFullyPaid;
    purchase.status = determineStatus(
      amountPaid,
      purchase.totalAmount,
      purchase.paymentSendDate
    );
    purchase.pendingAmount = pendingAmount;

    await purchase.save();
    await purchase.populate(["vendorId", "items.productId"]);

    res.status(200).json({ message: "Payment added successfully.", purchase });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export { addPaymentToPurchase, addPurchase, getPurchase, getPurchases };
