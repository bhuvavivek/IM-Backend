import Product from "../models/Product.js";
import Purchase from "../models/Purchase.js";
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

const addPurchase = async (req, res) => {
  try {
    const { vendorId, items, shippingDate, gstPercentage } = req.body;

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

    // Create purchase record
    const purchase = new Purchase({
      invoiceNumber,
      vendorId,
      items: processedItems,
      subtotal,
      gstPercentage,
      gstAmount,
      totalAmount,
      shippingDate,
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
      vendorName: `${purchase.vendorId?.firstName} ${purchase.vendorId?.lastName}`,
      invoiceNumber: purchase.invoiceNumber,
      createDate: purchase.createdAt,
      totalAmount: purchase.totalAmount,
      dueDate: purchase.purchaseDate,
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

    purchase = purchase.toObject();

    purchase = {
      _id: purchase._id,
      items: purchase.items,
      invoiceNumber: purchase.invoiceNumber,
      user: {
        name: `${purchase.vendorId.firstName}  ${purchase.vendorId.lastName}`,
        fullAddress: `${purchase.vendorId.shippingAddress.Address} ${purchase.vendorId.shippingAddress.city} ${purchase.vendorId.shippingAddress.state} ${purchase.vendorId.shippingAddress.country} / ${purchase.vendorId.shippingAddress.pinCode} `,
        phoneNumber: purchase.vendorId.contact,
      },
      createDate: purchase.createdAt,
      dueDate: purchase.purchaseDate,
      subtotal: purchase.subtotal,
      gstPercentage: purchase.gstPercentage,
      gstAmount: purchase.gstAmount,
      totalAmount: purchase.totalAmount,
    };
    res.status(200).json({ purchase });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

export { addPurchase, getPurchase, getPurchases };
