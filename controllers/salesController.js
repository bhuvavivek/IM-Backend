import { v4 as uuidv4 } from "uuid";
import Product from "../models/Product.js";
import Sales from "../models/Sales.js";

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
    const { customerId, items, shippingDate, gstPercentage } = req.body;

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
      const total = product.price * item.quantity;
      subtotal += total;

      return {
        productId: item.productId,
        quantity: item.quantity,
        price: product.price,
        total,
      };
    });

    const gstAmount = (subtotal * gstPercentage) / 100;
    const totalAmount = subtotal + gstAmount;

    // Generate unique invoice number
    const invoiceNumber = await generateUniqueInvoiceNumber();

    // Create sale record
    const sale = new Sales({
      invoiceNumber,
      customerId,
      items: processedItems,
      subtotal,
      gstPercentage,
      gstAmount,
      totalAmount,
      shippingDate,
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
    const sales = await Sales.find().populate("customerId"); // Populate only the customer's name\

    const formattedSales = sales.map((sale) => ({
      _id: sale._id,
      customerName: `${sale.customerId?.firstName} ${sale.customerId?.lastName}`,
      invoiceNumber: sale.invoiceNumber,
      createDate: sale.createdAt,
      dueDate: sale.shippingDate,
      totalAmount: sale.totalAmount,
    }));

    res.status(200).json({ sales: formattedSales });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

const getSale = async (req, res) => {
  try {
    const Saleid = req.params.id;
    let sale = await Sales.findById(Saleid)
      .populate("items.productId")
      .populate("customerId");

    sale = sale.toObject();

    sale = {
      _id: sale._id,
      items: sale.items,
      invoiceNumber: sale.invoiceNumber,
      user: {
        name: `${sale.customerId.firstName}  ${sale.customerId.lastName}`,
        fullAddress: `${sale.customerId.shippingAddress.Address} ${sale.customerId.shippingAddress.city} ${sale.customerId.shippingAddress.state} ${sale.customerId.shippingAddress.country} / ${sale.customerId.shippingAddress.pinCode} `,
        phoneNumber: sale.customerId.contact,
      },
      createDate: sale.createdAt,
      dueDate: sale.shippingDate,
      subtotal: sale.subtotal,
      gstPercentage: sale.gstPercentage,
      gstAmount: sale.gstAmount,
      totalAmount: sale.totalAmount,
    };

    res.status(200).json({ sale });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export { addSale, getSale, getSales };
