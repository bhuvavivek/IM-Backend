import mongoose from "mongoose";
import { v4 as uuidv4 } from "uuid";
import Product from "../models/Product.js";
import Purchase from "../models/Purchase.js";
import Stock from "../models/Stock.js";

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
  const session = await mongoose.startSession();
  session.startTransaction();
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

    const uniqueProductIds = [...new Set(items.map((item) => item.productId))];

    // Fetch product prices from the database
    const productDetails = await Product.find({
      _id: { $in: uniqueProductIds },
    }).session(session);

    if (productDetails.length !== uniqueProductIds.length) {
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

    await purchase.save({ session });
    await purchase.populate(["vendorId", "items.productId"]); // Populating customer and product details
    await session.commitTransaction();
    res.status(201).json(purchase);
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
      stock.quantity += item.quantity;
      stock.history.push({
        change: item.quantity,
        reason: "Purchase",
        changeType: "STOCK IN",
        bags: item.bagsize,
      });

      // Save the stock changes
      await stock.save({ session });
    }

    // Update the product's stock
    product.stock += item.quantity;
    product.totalWeight = parseFloat(product.weight) * product.stock;

    // Save the product changes
    await product.save({ session });
  } catch (error) {
    console.error("Error updating stock:", error.message);
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
        productId: item.productId._id,
        name: item.name,
        price: item.price,
        quantity: item.quantity,
        bag: item.bag,
        total: item.total,
        weight: item.weight,
        totalweight: item.totalweight,
        bagsize: item.bagsize,
        unit: item.unit,
        hsnCode: item.hsnCode,
      })),
      user: {
        name: `${vendor.firstName || ""}  ${vendor.lastName || ""}`.trim(),
        fullAddress: `${vendor?.shippingAddress?.Address || ""}, ${
          vendor?.shippingAddress?.city || ""
        }, ${vendor?.shippingAddress?.state || ""}, ${
          vendor?.shippingAddress?.country || ""
        } - ${vendor?.shippingAddress?.pinCode || ""}`,
        phoneNumber: vendor?.contact || "",
        businessName: vendor?.businessInformation?.businessName || "",
        businessFullAddress: `${vendor?.businessInformation?.Address || ""}, ${
          vendor?.businessInformation?.city || ""
        }, ${vendor?.businessInformation?.state || ""}, ${
          vendor?.businessInformation?.country || ""
        } - ${vendor?.businessInformation?.pinCode || ""}`,
        gstNumber: vendor?.businessInformation?.gstNumber || "",
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

const updatePurchase = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const {
      vendorId,
      items,
      gstPercentage,
      dueDate,
      isPaymentDone,
      paymentAmount,
    } = req.body;

    const existingPurchase = await Purchase.findById(id).session(session);
    if (!existingPurchase) {
      return res.status(404).json({ error: "Purchase not found" });
    }

    // Rollback previous stock
    for (const item of existingPurchase.items) {
      const product = await Product.findById(item.productId).session(session);
      if (product) {
        product.stock -= item.quantity;
        await product.save({ session });
      }
    }

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
      if (!product) throw new Error(`Product not found: ${item.productId}`);

      const total = parseFloat((item.price * item.quantity).toFixed(2));
      subtotal += total;

      // Update stock
      product.stock += item.quantity;
      product.save({ session });

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

    const paymentSendDate = isPaymentDone ? new Date() : null;
    const gstAmount = (subtotal * gstPercentage) / 100;
    const totalAmount = subtotal + gstAmount;
    const cgst = gstAmount / 2;
    const sgst = gstAmount / 2;

    const payments = [];
    let amountSent = 0;
    if (isPaymentDone && paymentAmount > 0) {
      payments.push({
        amount: paymentAmount,
        date: paymentSendDate,
        mode: "initial",
        remarks: "Initial payment",
      });
      amountSent = paymentAmount;
    }

    const isFullyPaid = amountSent >= totalAmount;
    const status = determineStatus(amountSent, totalAmount, dueDate);
    const pendingAmount = totalAmount - amountSent;

    Object.assign(existingPurchase, {
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

    await existingPurchase.save({ session });
    await existingPurchase.populate(["vendorId", "items.productId"]);

    await session.commitTransaction();
    res.status(200).json(existingPurchase);
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

const deletePurchase = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const { id } = req.params;
    const purchase = await Purchase.findById(id).session(session);

    if (!purchase) {
      return res.status(404).json({ error: "Purchase not found" });
    }

    // Rollback stock
    for (const item of purchase.items) {
      const product = await Product.findById(item.productId).session(session);
      if (product) {
        product.stock -= item.quantity;
        product.totalWeight = parseFloat(product.weight) * product.stock;
        await product.save({ session });
      }
    }

    await Purchase.deleteOne({ _id: id }).session(session);
    await session.commitTransaction();
    res.status(200).json({ message: "Purchase deleted successfully" });
  } catch (error) {
    await session.abortTransaction();
    res.status(400).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

const getPurchaseInvoiceById = async (req, res) => {
  try {
    const { id } = req.params;

    const invoice = await Purchase.findById(id)
      .populate("vendorId")
      .populate("items.productId");

    if (!invoice) {
      return res.status(404).json({ message: "Invoice not found" });
    }

    const transformed = {
      _id: invoice._id,
      createDate: invoice.createdAt,
      dueDate: invoice.purchaseDate,
      invoiceTo: invoice.vendorId,
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
      isInitialPayment: invoice.amountPaid > 0,
      initialPayment: invoice.amountPaid,
      salesMenName: "",
      salesCommision: 0,
    };

    res.json({ purchase: transformed });
  } catch (error) {
    console.error("Error fetching purchase invoice:", error);
    res.status(500).json({ message: "Server Error" });
  }
};

export {
  addPaymentToPurchase,
  addPurchase,
  deletePurchase,
  getPurchase,
  getPurchaseInvoiceById,
  getPurchases,
  updatePurchase,
};
