import Expense from "../models/Expense.js";
import Product from "../models/Product.js";
import Purchase from "../models/Purchase.js";
import Sales from "../models/Sales.js";
import Stock from "../models/Stock.js";

const getOverallReport = async (req, res) => {
  try {
    const { from, to } = req.query;

    const dateFilter = {};
    if (from && to) {
      dateFilter.createdAt = {
        $gte: new Date(from),
        $lte: new Date(to),
      };
    }

    // Total Sales
    const salesData = await Sales.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalSales: { $sum: "$totalAmount" },
          totalPendingFromCustomers: { $sum: "$pendingAmount" },
        },
      },
    ]);

    // Total Purchases
    const purchaseData = await Purchase.aggregate([
      { $match: dateFilter },
      { $unwind: "$items" }, // Unwind the items array in the purchases collection
      {
        $group: {
          _id: "$items.name", // Group by product name in the purchase items
          totalPurchases: { $sum: "$items.total" }, // Sum the total purchases for each product
        },
      },
    ]);

    // Total Expenses
    const expenseData = await Expense.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: null,
          totalExpenses: { $sum: "$amount" },
        },
      },
    ]);

    // Stock Info
    const totalStockProducts = await Product.aggregate([
      { $match: { isDeleted: false } },
      {
        $group: {
          _id: null,
          totalStockQuantity: { $sum: "$stock" },
          totalStockWeight: { $sum: "$totalWeight" },
        },
      },
    ]);

    // Category-wise Sales (using product name as category)
    const categorySales = await Sales.aggregate([
      { $match: dateFilter },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name", // Group by product name
          totalSales: { $sum: "$items.total" }, // Sum the sales amount for each product
        },
      },
    ]);

    // Category-wise Purchases (using product name as category)
    const categoryPurchases = await Purchase.aggregate([
      { $match: dateFilter },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.name", // Group by product name
          totalPurchases: { $sum: "$items.total" }, // Sum the purchase amount for each product
        },
      },
    ]);

    const totalSales = salesData[0]?.totalSales || 0;
    const totalPendingFromCustomers =
      salesData[0]?.totalPendingFromCustomers || 0;

    const totalPurchases = purchaseData[0]?.totalPurchases || 0;
    const totalPendingToVendors = purchaseData[0]?.totalPendingToVendors || 0;

    const totalExpenses = expenseData[0]?.totalExpenses || 0;

    const profit = totalSales - totalPurchases - totalExpenses;

    res.status(200).json({
      totalSales,
      totalPurchases,
      totalExpenses,
      profit,
      pendingFromCustomers: totalPendingFromCustomers,
      pendingToVendors: totalPendingToVendors,
      stockSummary: {
        totalStockQuantity: totalStockProducts[0]?.totalStockQuantity || 0,
        totalStockWeight: totalStockProducts[0]?.totalStockWeight || 0,
      },
      categorySales, // Adding category sales data
      categoryPurchases, // Adding category purchases data
    });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ message: "Error generating report", error: error.message });
  }
};

const getPartyWiseReport = async (req, res) => {
  try {
    const { from, to } = req.query;

    const dateFilter = {};
    if (from && to) {
      dateFilter.createdAt = {
        $gte: new Date(from),
        $lte: new Date(to),
      };
    }

    // --- Customer Party Report (Sales) ---
    const customerSales = await Sales.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$customerId",
          totalSales: { $sum: "$totalAmount" },
          totalPaid: { $sum: "$amountPaid" },
          pendingAmount: { $sum: "$pendingAmount" },
        },
      },
      {
        $lookup: {
          from: "customers",
          localField: "_id",
          foreignField: "_id",
          as: "customerInfo",
        },
      },
      { $unwind: "$customerInfo" },
      {
        $project: {
          _id: 0,
          customerName: {
            $concat: ["$customerInfo.firstName", " ", "$customerInfo.lastName"],
          },
          totalSales: 1,
          totalPaid: 1,
          pendingAmount: 1,
        },
      },
      // Category-wise sales for customers
      {
        $lookup: {
          from: "sales",
          localField: "_id",
          foreignField: "customerId",
          as: "salesDetails",
        },
      },
      { $unwind: "$salesDetails" },
      {
        $group: {
          _id: "$salesDetails.items.name", // Group by product name
          totalCustomerSales: { $sum: "$salesDetails.items.total" }, // Sum of sales by product name
        },
      },
    ]);

    // --- Vendor Party Report (Purchases) ---
    const vendorPurchases = await Purchase.aggregate([
      { $match: dateFilter },
      {
        $group: {
          _id: "$vendorId",
          totalPurchase: { $sum: "$totalAmount" },
          totalPaid: { $sum: "$amountPaid" },
          pendingAmount: { $sum: "$pendingAmount" },
        },
      },
      {
        $lookup: {
          from: "vendors",
          localField: "_id",
          foreignField: "_id",
          as: "vendorInfo",
        },
      },
      { $unwind: "$vendorInfo" },
      {
        $project: {
          _id: 0,
          vendorName: {
            $concat: ["$vendorInfo.firstName", " ", "$vendorInfo.lastName"],
          },
          totalPurchase: 1,
          totalPaid: 1,
          pendingAmount: 1,
        },
      },
      // Category-wise purchases for vendors
      {
        $lookup: {
          from: "purchases",
          localField: "_id",
          foreignField: "vendorId",
          as: "purchaseDetails",
        },
      },
      { $unwind: "$purchaseDetails" },
      {
        $group: {
          _id: "$purchaseDetails.items.name", // Group by product name
          totalVendorPurchases: { $sum: "$purchaseDetails.items.total" }, // Sum of purchases by product name
        },
      },
    ]);

    // Profit Calculation per Customer
    customerSales.forEach((customer) => {
      const profit =
        customer.totalSales - customer.totalPaid - customer.pendingAmount;
      customer.profit = profit;
    });

    // Profit Calculation per Vendor
    vendorPurchases.forEach((vendor) => {
      const profit =
        vendor.totalPurchase - vendor.totalPaid - vendor.pendingAmount;
      vendor.profit = profit;
    });

    res.status(200).json({
      customers: customerSales,
      vendors: vendorPurchases,
    });
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Error generating party-wise report",
      error: error.message,
    });
  }
};

const getProductWiseReport = async (req, res) => {
  try {
    const { from, to } = req.query;

    const dateFilter = {};
    if (from && to) {
      dateFilter.createdAt = {
        $gte: new Date(from),
        $lte: new Date(to),
      };
    }

    // Fetch all products
    const products = await Product.find({ isDeleted: { $ne: true } });

    // Fetch Sales grouped by Product
    const salesData = await Sales.aggregate([
      { $match: dateFilter },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          totalSoldQuantity: { $sum: "$items.quantity" },
          totalSoldWeight: {
            $sum: { $multiply: ["$items.quantity", "$items.weight"] },
          }, // Total sold weight
          totalRevenue: {
            $sum: { $multiply: ["$items.quantity", "$items.price"] },
          }, // Total revenue
          totalSoldBags: {
            $sum: { $multiply: ["$items.quantity", "$items.bag"] },
          }, // Total bags sold
        },
      },
    ]);

    // Fetch Purchases grouped by Product
    const purchaseData = await Purchase.aggregate([
      { $match: dateFilter },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          totalPurchasedQuantity: { $sum: "$items.quantity" },
          totalPurchasedWeight: {
            $sum: { $multiply: ["$items.quantity", "$items.weight"] },
          }, // Total purchased weight (without bags)
        },
      },
    ]);

    // Fetch Stock Data
    const stocks = await Stock.find();

    // Mapping sales data
    const salesMap = {};
    salesData.forEach((sale) => {
      salesMap[sale._id.toString()] = {
        totalSoldQuantity: sale.totalSoldQuantity,
        totalSoldWeight: sale.totalSoldWeight,
        totalRevenue: sale.totalRevenue,
        totalSoldBags: sale.totalSoldBags,
      };
    });

    // Mapping purchase data
    const purchaseMap = {};
    purchaseData.forEach((purchase) => {
      purchaseMap[purchase._id.toString()] = {
        totalPurchasedQuantity: purchase.totalPurchasedQuantity,
        totalPurchasedWeight: purchase.totalPurchasedWeight,
      };
    });

    // Mapping stock data
    const stockMap = {};
    stocks.forEach((stock) => {
      stockMap[stock.productId.toString()] = stock.quantity;
    });

    // Generate Report
    const report = products.map((product) => {
      const sales = salesMap[product._id.toString()] || {};
      const purchases = purchaseMap[product._id.toString()] || {};
      const stock = stockMap[product._id.toString()] || 0;

      const totalRevenue = sales.totalRevenue || 0;
      const totalSoldQuantity = sales.totalSoldQuantity || 0;
      const totalSoldWeight = sales.totalSoldWeight || 0;
      const totalSoldBags = sales.totalSoldBags || 0;
      const totalPurchasedQuantity = purchases.totalPurchasedQuantity || 0;
      const totalPurchasedWeight = purchases.totalPurchasedWeight || 0;

      const grossProfit =
        totalRevenue - totalPurchasedWeight * product.costPrice; // Assuming product has a costPrice field

      // Calculating Stock Turnover Ratio: Total Sold / Average Stock
      const avgStock = (stock + totalPurchasedQuantity) / 2;
      const stockTurnoverRatio =
        avgStock > 0 ? totalSoldQuantity / avgStock : 0;

      // Calculating Days of Stock Remaining: Stock / Average Daily Sales
      const avgDailySales = totalSoldQuantity / 30; // Assuming a 30-day period
      const daysOfStockRemaining =
        avgDailySales > 0 ? stock / avgDailySales : 0;

      // Sales to Purchases Ratio: Sales / Purchases
      const salesToPurchasesRatio =
        totalPurchasedQuantity > 0
          ? totalSoldQuantity / totalPurchasedQuantity
          : 0;

      return {
        productName: product.name,
        totalSoldQuantity,
        totalSoldWeight,
        totalRevenue,
        grossProfit,
        totalSoldBags,
        totalPurchasedQuantity,
        totalPurchasedWeight,
        availableStock: stock,
        stockTurnoverRatio,
        daysOfStockRemaining,
        salesToPurchasesRatio,
      };
    });

    res.status(200).json(report);
  } catch (error) {
    console.error(error);
    res.status(500).json({
      message: "Error generating product wise report",
      error: error.message,
    });
  }
};

const generateDetailedInvoiceReport = async (req, res) => {
  try {
    const { from, to, customerOrVendor, customerId, vendorId } = req.query; // Get customer/vendor ID
    const filter = { createdAt: { $gte: new Date(from), $lte: new Date(to) } };

    // Add customer or vendor filter
    if (customerOrVendor === "customer" && customerId) {
      filter.customerId = customerId;
    }
    if (customerOrVendor === "vendor" && vendorId) {
      filter.vendorId = vendorId;
    }

    const invoices = await Sales.aggregate([
      { $match: filter },
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      { $unwind: "$productDetails" },
      {
        $project: {
          invoiceNumber: 1,
          createdAt: 1,
          productName: "$productDetails.name",
          productDescription: "$productDetails.description",
          quantityKg: "$items.quantity", // quantity of the product in the invoice
          bagSizeKg: "$productDetails.bagSize", // bag size in kg
          qtyBags: "$items.qtyBags", // number of bags
          price: "$items.price",
          totalAmount: {
            $multiply: [
              "$items.qtyBags",
              "$productDetails.bagSize",
              "$items.price",
            ],
          }, // Correct calculation
          subtotal: "$subtotal",
          cgst: "$cgst",
          sgst: "$sgst",
          paidAmount: "$paidAmount",
          pendingAmount: "$pendingAmount",
        },
      },
      {
        $group: {
          _id: "$invoiceNumber",
          invoiceNumber: { $first: "$invoiceNumber" },
          dateOfBill: { $first: "$createdAt" },
          products: {
            $push: {
              productName: "$productName",
              totalWeight: {
                $multiply: ["$items.qtyBags", "$productDetails.bagSize"],
              }, // Correct weight calculation
              totalAmount: "$totalAmount",
            },
          },
          subtotal: { $first: "$subtotal" },
          cgst: { $first: "$cgst" },
          sgst: { $first: "$sgst" },
          paidAmount: { $first: "$paidAmount" },
          pendingAmount: { $first: "$pendingAmount" },
        },
      },
    ]);

    // Fetch all products from the database
    const allProducts = await Product.find();

    // Prepare the productQuantities array to include all products
    const productQuantities = allProducts.map((product) => {
      const productInInvoice = invoices.flatMap((invoice) =>
        invoice.products.find((item) => item.productName === product.name)
      )[0]; // Find the first matching product in the current invoices

      return {
        productName: product.name,
        quantityKg: productInInvoice ? productInInvoice.totalWeight : 0, // If the product is found in the invoice, set its total weight; otherwise, set it to 0
      };
    });

    // Generate the report data
    const report = invoices.map((invoice) => {
      return {
        invoiceNumber: invoice.invoiceNumber,
        dateOfBill: invoice.dateOfBill,
        products: invoice.products.map((product) => ({
          productName: product.productName,
          totalWeight: product.totalWeight,
          totalAmount: product.totalAmount,
        })),
        subtotal: invoice.subtotal,
        cgst: invoice.cgst,
        sgst: invoice.sgst,
        paidAmount: invoice.paidAmount,
        pendingAmount: invoice.pendingAmount,
        balance: invoice.subtotal - invoice.paidAmount,
        productQuantities, // Include the full product quantities with 0 if not in invoice
      };
    });

    // Summarize totals for the report
    let totalBags = 0,
      totalWeight = 0,
      totalAmount = 0,
      totalCgst = 0,
      totalSgst = 0,
      totalBalance = 0;

    invoices.forEach((invoice) => {
      invoice.products.forEach((product) => {
        totalBags += product.totalAmount; // Adding total amount to bags
        totalWeight += product.totalWeight; // Adding total weight of each product
      });
      totalAmount += invoice.subtotal;
      totalCgst += invoice.cgst;
      totalSgst += invoice.sgst;
      totalBalance += invoice.subtotal - invoice.paidAmount;
    });

    // Final summary at the end of the report
    const summary = {
      totalBags,
      totalWeight,
      totalAmount,
      totalCgst,
      totalSgst,
      totalBalance,
    };

    res.status(200).json({
      status: "success",
      data: {
        report,
        summary,
      },
    });
  } catch (error) {
    console.error("Error generating detailed invoice report:", error);
    res.status(500).json({ status: "error", message: error.message });
  }
};

export {
  generateDetailedInvoiceReport,
  getOverallReport,
  getPartyWiseReport,
  getProductWiseReport,
};
