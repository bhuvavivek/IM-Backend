import XLSX from "xlsx";
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
    const {
      from,
      to,
      customerOrVendor = "customer",
      customerId = "67ebeb39f709f895e471be86",
      vendorId,
    } = req.query;

    const fromDate = from ? new Date(from) : new Date(0); // Default to the Unix epoch (January 1, 1970)
    const toDate = to ? new Date(to) : new Date(); // Default to the current date

    const filter = { createdAt: { $gte: fromDate, $lte: toDate } };

    if (customerOrVendor === "customer" && customerId) {
      filter.customerId = customerId;
    }
    if (customerOrVendor === "vendor" && vendorId) {
      filter.vendorId = vendorId;
    }

    const invoices = await Sales.aggregate([
      { $unwind: "$items" },
      {
        $lookup: {
          from: "products",
          localField: "items.productId",
          foreignField: "_id",
          as: "productDetails",
        },
      },
      {
        $project: {
          _id: 1,
          invoiceNumber: 1,
          customerId: 1,
          items: 1,
          subtotal: 1,
          gstPercentage: 1,
          gstAmount: 1,
          cgst: 1,
          sgst: 1,
          totalAmount: 1,
          dueDate: 1,
          amountPaid: 1,
          pendingAmount: 1,
          createdAt: 1,
          updatedAt: 1,
        },
      },
    ]);

    if (!invoices.length) {
      return res.status(200).json({ status: "success", data: [] });
    }

    // Create rows: product-wise
    let csvData = [];
    let summaryRows = [];
    let grandTotal = {
      bags: 0,
      weight: 0,
      amount: 0,
      cgst: 0,
      sgst: 0,
      totalAmount: 0,
      paidAmount: 0,
      pendingAmount: 0,
      balance: 0,
    };

    const allProductsSet = new Set();
    invoices.forEach((inv) => allProductsSet.add(inv.items.name)); // Assuming 'name' is the product name
    const allProducts = Array.from(allProductsSet);

    const invoiceGroups = invoices.reduce((acc, curr) => {
      acc[curr.invoiceNumber] = acc[curr.invoiceNumber] || [];
      acc[curr.invoiceNumber].push(curr);
      return acc;
    }, {});

    for (const [invoiceNumber, products] of Object.entries(invoiceGroups)) {
      let invoiceTotals = {
        bags: 0,
        weight: 0,
        amount: 0,
        cgst: 0,
        sgst: 0,
        totalAmount: 0,
        paidAmount: 0,
        pendingAmount: 0,
        balance: 0,
      };

      products.forEach((product) => {
        // Use price from sale or purchase item (product.items.price)
        const price = product.items.price;

        invoiceTotals.bags += product.items.bag;
        invoiceTotals.weight += product.items.totalweight;
        invoiceTotals.amount += product.items.total;
        invoiceTotals.cgst += product.cgst;
        invoiceTotals.sgst += product.sgst;
        invoiceTotals.totalAmount =
          product.subtotal + (product.cgst || 0) + (product.sgst || 0);
        invoiceTotals.paidAmount = product.amountPaid;
        invoiceTotals.pendingAmount = product.pendingAmount;
        invoiceTotals.balance =
          (product.subtotal || 0) - (product.amountPaid || 0);

        csvData.push({
          "Invoice Number": product.invoiceNumber,
          "Date of Bill": product.createdAt.toISOString().split("T")[0],
          "Product Name": product.items.name, // Adjusted to reflect your data structure
          "Bag Size (kg)": product.items.bagsize,
          "Qty (Number of Bags)": product.items.bag,
          "Total Weight (kg)": product.items.totalweight,
          "Item Price": price, // Now using the price from the sale/purchase
          Amount: product.items.total,
          CGST: product.cgst,
          SGST: product.sgst,
          "Total Amount":
            product.subtotal + (product.cgst || 0) + (product.sgst || 0),
          "Paid Amount": product.amountPaid,
          "Pending Amount": product.pendingAmount,
          Balance: (product.subtotal || 0) - (product.amountPaid || 0),
          ...Object.fromEntries(
            allProducts.map((p) => [
              p,
              p === product.items.name ? `${product.items.totalweight} kg` : "",
            ])
          ),
        });
      });

      // Summary row for invoice
      summaryRows.push({
        "Invoice Number": "Summary",
        "Date of Bill": "",
        "Product Name": "",
        "Bag Size (kg)": "",
        "Qty (Number of Bags)": "",
        "Total Weight (kg)": `${invoiceTotals.weight} kg`,
        "Item Price": "",
        Amount: invoiceTotals.amount,
        CGST: invoiceTotals.cgst,
        SGST: invoiceTotals.sgst,
        "Total Amount": invoiceTotals.totalAmount,
        "Paid Amount": invoiceTotals.paidAmount,
        "Pending Amount": invoiceTotals.pendingAmount,
        Balance: invoiceTotals.balance,
        ...Object.fromEntries(
          allProducts.map((p) => {
            const prod = products.find((pr) => pr.items.name === p);
            return [p, prod ? `${prod.items.totalweight} kg` : ""];
          })
        ),
      });

      grandTotal.bags += invoiceTotals.bags;
      grandTotal.weight += invoiceTotals.weight;
      grandTotal.amount += invoiceTotals.amount;
      grandTotal.cgst += invoiceTotals.cgst;
      grandTotal.sgst += invoiceTotals.sgst;
      grandTotal.totalAmount += invoiceTotals.totalAmount;
      grandTotal.paidAmount += invoiceTotals.paidAmount;
      grandTotal.pendingAmount += invoiceTotals.pendingAmount;
      grandTotal.balance += invoiceTotals.balance;
    }

    // Push Total
    summaryRows.push({
      "Invoice Number": "Total",
      "Date of Bill": "",
      "Product Name": "",
      "Bag Size (kg)": "",
      "Qty (Number of Bags)": `${grandTotal.bags} Bags`,
      "Total Weight (kg)": `${grandTotal.weight} kg`,
      "Item Price": "",
      Amount: grandTotal.amount,
      CGST: grandTotal.cgst,
      SGST: grandTotal.sgst,
      "Total Amount": grandTotal.totalAmount,
      "Paid Amount": grandTotal.paidAmount,
      "Pending Amount": grandTotal.pendingAmount,
      Balance: grandTotal.balance,
      ...Object.fromEntries(
        allProducts.map((p) => {
          const totalProductWeight = invoices
            .filter((inv) => inv.items.name === p)
            .reduce((sum, curr) => sum + curr.items.totalweight, 0);
          return [p, `${totalProductWeight} kg`];
        })
      ),
    });

    // Final Data
    const finalCsvData = [...csvData, ...summaryRows];

    // Generate Excel file
    const ws = XLSX.utils.json_to_sheet(finalCsvData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Invoice Report");

    // Write Excel file to response
    const fileBuffer = XLSX.write(wb, { bookType: "xlsx", type: "buffer" });

    // Send file as response
    res.setHeader(
      "Content-Disposition",
      "attachment; filename=invoice_report.xlsx"
    );
    res.setHeader(
      "Content-Type",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    res.send(fileBuffer);
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
