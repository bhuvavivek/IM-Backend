import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import Customer from "../models/Customer.js";
import Vendor from '../models/Vendor.js'
import Expense from "../models/Expense.js";
import Product from "../models/Product.js";
import Purchase from "../models/Purchase.js";
import Sales from "../models/Sales.js";
import Stock from "../models/Stock.js";
import mongoose from "mongoose";

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

// sale report

const generateCustomerReport = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { startDate, endDate } = req.query;

    const customer = await Customer.findById(customerId);
    if (!customer)
      return res.status(404).json({ message: "Customer not found" });

    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const query = { customerId };
    if (startDate || endDate) query.createdAt = dateFilter;

    const sales = await Sales.find(query).lean();
    if (!sales.length) {
      return res
        .status(404)
        .json({ message: "No sales found for this customer in given range." });
    }

    const workbook = new ExcelJS.Workbook({
      useStyles: true,
      useSharedStrings: true,
    });

    const sheet = workbook.addWorksheet("Sales Report");

    sheet.columns = [
      { header: "SR No.", key: "srNo", width: 10 },
      { header: "Invoice Number", key: "invoiceNumber", width: 20 },
      { header: "Invoice Date", key: "createdAt", width: 20 },
      { header: "Product Name", key: "name", width: 20 },
      { header: "HSN Code", key: "hsnCode", width: 15 },
      { header: "Bag Size", key: "bagsize", width: 15 },
      { header: "Bag Count", key: "bag", width: 10 },
      { header: "Weight", key: "weight", width: 10 },
      { header: "Total Weight", key: "totalweight", width: 15 },
      { header: "Unit", key: "unit", width: 10 },
      { header: "Price", key: "price", width: 10 },
      { header: "Quantity", key: "quantity", width: 10 },
      { header: "Total", key: "total", width: 20 },
    ];

    let grandTotal = 0;
    let grandSubtotal = 0;
    let grandGST = 0;
    let srNo = 1;

    for (const invoice of sales) {
      sheet.addRow({
        srNo: srNo++,
        invoiceNumber: `🧾 Invoice: ${invoice.invoiceNumber}`,
        createdAt: new Date(invoice.createdAt).toLocaleDateString(),
      });

      for (const item of invoice.items) {
        sheet.addRow({
          srNo: "",
          invoiceNumber: "",
          createdAt: "",
          name: item.name,
          hsnCode: item.hsnCode,
          bagsize: item.bagsize,
          bag: item.bag,
          weight: item.weight,
          totalweight: item.totalweight,
          unit: item.unit,
          price: item.price,
          quantity: item.quantity,
          total: item.total,
        });
      }

      // Subtotal row merged
      const subtotalRow = sheet.addRow({});
      const subtotalCell = sheet.getCell(`M${subtotalRow.number}`);
      subtotalCell.value = `Subtotal: ₹${invoice.subtotal.toFixed(
        2
      )} | GST: ₹${invoice.gstAmount.toFixed(
        2
      )} | Total: ₹${invoice.totalAmount.toFixed(2)}`;
      subtotalCell.font = { bold: true, size: 12 };
      subtotalCell.alignment = { horizontal: "center", vertical: "middle" };
      sheet.mergeCells(`M${subtotalRow.number}:S${subtotalRow.number}`);

      sheet.addRow({}); // spacing row

      grandSubtotal += invoice.subtotal;
      grandGST += invoice.gstAmount;
      grandTotal += invoice.totalAmount;
    }

    // Grand summary rows
    sheet.addRow({}); // space before grand summary

    const addGrandRow = (label, value, fontSize = 12) => {
      const row = sheet.addRow({});
      const cell = sheet.getCell(`M${row.number}`);
      cell.value = `${label}: ₹${value.toFixed(2)}`;
      cell.font = { bold: true, size: fontSize };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      sheet.mergeCells(`M${row.number}:S${row.number}`);
    };

    addGrandRow("Grand Subtotal", grandSubtotal);
    addGrandRow("Grand GST", grandGST);
    addGrandRow("Grand Total", grandTotal, 14);

    // Styling headers and alignment
    sheet.eachRow((row, rowNumber) => {
      row.eachCell((cell, colNumber) => {
        if (rowNumber === 1) {
          cell.font = { bold: true };
          cell.alignment = { horizontal: "center", vertical: "middle" };
        } else {
          cell.alignment =
            colNumber === 1
              ? { horizontal: "center", vertical: "middle" }
              : { horizontal: "left", vertical: "middle" };
        }
      });
    });

    // Write file
    const reportsDir = path.join("./reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const fileName = `${customer.businessInformation.businessName.replace(
      /[^a-z0-9]/gi,
      "_"
    )}_Sales_Report.xlsx`;
    const filePath = path.join(reportsDir, fileName);

    await workbook.xlsx.writeFile(filePath);

    res.download(filePath, fileName, (err) => {
      if (err) {
        console.error("Download error:", err);
        res.status(500).send("Could not download the file.");
      } else {
        fs.unlink(filePath, () => {});
      }
    });
  } catch (err) {
    console.error("Error generating sales report:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

const generateSalesReport = async (req, res) => {
  try {
    const { startDate, endDate, download } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);
    const matchStage = startDate || endDate ? { createdAt: dateFilter } : {};

    // Aggregate sales data
    const salesSummary = await Sales.aggregate([
      { $match: matchStage },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$customerId",
          totalPurchases: { $sum: "$totalAmount" },
          totalPaid: { $sum: "$amountPaid" },
          totalPending: { $sum: "$pendingAmount" },
          invoiceCount: { $addToSet: "$invoiceNumber" },
          totalGST: { $sum: "$gstAmount" },
          totalBags: { $sum: "$items.bag" },
          firstInvoiceDate: { $min: "$createdAt" },
          lastInvoiceDate: { $max: "$createdAt" },
        },
      },
      {
        $addFields: {
          invoiceCount: { $size: "$invoiceCount" },
        },
      },
      {
        $lookup: {
          from: "customers",
          localField: "_id",
          foreignField: "_id",
          as: "customer",
        },
      },
      { $unwind: "$customer" },
      {
        $project: {
          customerId: "$_id",
          businessName: "$customer.businessInformation.businessName",
          totalPurchases: 1,
          totalPaid: 1,
          totalPending: 1,
          invoiceCount: 1,
          totalGST: 1,
          totalBags: 1,
          firstInvoiceDate: 1,
          lastInvoiceDate: 1,
        },
      },
    ]);

    if (!salesSummary.length) {
      return res
        .status(200)
        .json({ message: "No sales found in date range.", summary: [] });
    }

    // Generate Excel if download is true
    if (download === "true") {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook({
        useStyles: true,
        useSharedStrings: true,
      });
      const sheet = workbook.addWorksheet("Customer Sales Summary");

      // Define columns
      sheet.columns = [
        { header: "SR No.", key: "srNo", width: 10 },
        { header: "Business Name", key: "businessName", width: 30 },
        { header: "Total Purchase (₹)", key: "totalPurchases", width: 20 },
        { header: "Amount Paid (₹)", key: "totalPaid", width: 20 },
        { header: "Pending Amount (₹)", key: "totalPending", width: 20 },
        { header: "Invoices", key: "invoiceCount", width: 10 },
        { header: "GST Collected (₹)", key: "totalGST", width: 20 },
        { header: "Total Bags", key: "totalBags", width: 15 },
      ];

      // Fill data rows
      salesSummary.forEach((entry, index) => {
        sheet.addRow({
          srNo: index + 1,
          businessName: entry.businessName,
          totalPurchases: parseFloat(entry.totalPurchases.toFixed(2)),
          totalPaid: parseFloat(entry.totalPaid.toFixed(2)),
          totalPending: parseFloat(entry.totalPending.toFixed(2)),
          invoiceCount: entry.invoiceCount,
          totalGST: parseFloat(entry.totalGST.toFixed(2)),
          totalBags: entry.totalBags,
        });
      });

      // Save Excel file
      const reportsDir = path.join(process.cwd(), "reports");
      if (!fs.existsSync(reportsDir)) {
        fs.mkdirSync(reportsDir, { recursive: true });
      }

      // Bold and center header row, and center all data rows
      sheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.alignment = { horizontal: "center", vertical: "middle" };
          if (rowNumber === 1) {
            cell.font = { bold: true };
          }
        });
      });

      const sDate = new Date(startDate);
      const eDate = new Date(endDate);
      const formatDate = (date) =>
        `${date.getDate()}-${date.getMonth() + 1}-${date.getFullYear()}`;
      const startStr = formatDate(sDate);
      const endStr = formatDate(eDate);
      const dateRange =
        startStr === endStr ? startStr : `${startStr}_to_${endStr}`;
      const fileName = `Sales_Summary_${dateRange}.xlsx`;
      const filePath = path.join(reportsDir, fileName);

      await workbook.xlsx.writeFile(filePath);

      return res.download(filePath, fileName, (err) => {
        if (err) {
          console.error("Download error:", err);
          res.status(500).send("Could not download the report.");
        } else {
          fs.unlink(filePath, () => {}); // Clean up after download
        }
      });
    }

    return res.json({ success: true, summary: salesSummary });
  } catch (error) {
    console.error("Sales summary error:", error);
    res.status(500).json({
      message: "Error generating sales summary report",
      error: error.message,
    });
  }
};

const getCustomerInvoiceReport = async (req, res) => {
  try {
    const { customerId } = req.params;
    const { startDate, endDate } = req.query;

    // Build date filter
    const dateFilter = {};
    if (startDate) dateFilter.$gte = new Date(startDate);
    if (endDate) dateFilter.$lte = new Date(endDate);

    const filter = {
      customerId,
      ...(startDate || endDate ? { createdAt: dateFilter } : {}),
    };

    const sales = await Sales.find(filter)
      .select(
        "invoiceNumber subtotal gstAmount totalAmount amountPaid pendingAmount status createdAt dueDate"
      )
      .sort({ createdAt: -1 });

    return res.status(200).json({ customerInvoice: sales });
  } catch (error) {
    console.error("Error fetching invoice report:", error);
    return res.status(500).json({ message: "Server error" });
  }
};


const getProductSalesReport = async ({ startDate, endDate }) => {
  try {
    const matchQuery = {};
    if (startDate && endDate) {
      matchQuery["createdAt"] = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    } else if (startDate) {
      matchQuery["createdAt"] = { $gte: new Date(startDate) };
    } else if (endDate) {
      matchQuery["createdAt"] = { $lte: new Date(endDate) };
    }

    const salesData = await Sales.aggregate([
      { $match: matchQuery },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          productId: { $first: "$items.productId" },
          name: { $first: "$items.name" },
          unit: { $first: "$items.unit" },
          totalQuantity: { $sum: "$items.quantity" },
          totalWeight: { $sum: "$items.totalweight" },
          totalBags: { $sum: "$items.bag" },
          firstDate: { $min: "$createdAt" }, 
          lastDate: { $max: "$createdAt" }, 
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "productInfo",
        },
      },
      { $unwind: "$productInfo" },
      {
        $project: {
          _id: 0,
          productId: 1,
          name: 1,
          unit: 1,
          totalQuantity: 1,
          totalWeight: 1,
          totalBags: 1,
          stock: "$productInfo.stock",
          firstDate: 1, 
          lastDate: 1,
        },
      },
    ]);

    return salesData;
  } catch (error) {
    console.error("Error fetching product sales report:", error);
    throw error;
  }
};

const getProductPurchasesReport = async ({ startDate, endDate }) => {
  try {
    const matchQuery = {};
    if (startDate && endDate) {
      matchQuery["purchaseDate"] = {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      };
    } else if (startDate) {
      matchQuery["purchaseDate"] = { $gte: new Date(startDate) };
    } else if (endDate) {
      matchQuery["purchaseDate"] = { $lte: new Date(endDate) };
    }

    const purchasesData = await Purchase.aggregate([
      { $match: matchQuery },
      { $unwind: "$items" },
      {
        $group: {
          _id: "$items.productId",
          productId: { $first: "$items.productId" },
          name: { $first: "$items.name" },
          unit: { $first: "$items.unit" },
          totalQuantity: { $sum: "$items.quantity" },
          totalWeight: { $sum: "$items.totalweight" },
          totalBags: { $sum: "$items.bag" },
          firstDate: { $min: "$purchaseDate" },
          lastDate: { $max: "$purchaseDate" },
        },
      },
      {
        $lookup: {
          from: "products",
          localField: "_id",
          foreignField: "_id",
          as: "productInfo",
        },
      },
      { $unwind: "$productInfo" },
      {
        $project: {
          _id: 0,
          productId:1,
          name: 1,
          unit: 1,
          totalQuantity: 1,
          totalWeight: 1,
          totalBags: 1,
          stock: "$productInfo.stock",
          firstDate: 1, 
          lastDate: 1,
        },
      },
    ]);

    return purchasesData;
  } catch (error) {
    console.error("Error fetching product purchases report:", error);
    throw error;
  }
};

const getStockSummaryReport = async (req, res) => {
  try {
    const { startDate, endDate, type, download } = req.query;

    let report;
    let reportType = "";

    if (type === "sales") {
      report = await getProductSalesReport({ startDate, endDate });
      reportType = "Sales";
    } else if (type === "purchases") {
      report = await getProductPurchasesReport({ startDate, endDate });
      reportType = "Purchases";
    } else {
      return res.status(400).json({ message: "Invalid report type provided. Use 'sales' or 'purchases'." });
    }

    const isDownload = download?.toString().toLowerCase() === "true";

    if (isDownload) {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(`${reportType} Report`);

      sheet.columns = [
        { header: "SR No.", key: "srNo", width: 10 },
        { header: "Product Name", key: "name", width: 25 },
        { header: "Unit", key: "unit", width: 10 },
        { header: "Current Stock", key: "stock", width: 15 },
        { header: `Total ${reportType === 'Sales' ? 'Sales' : 'Purchases'} Quantity`, key: "totalQuantity", width: 20 },
        { header: `Total ${reportType === 'Sales' ? 'Sales' : 'Purchases'} Weight`, key: "totalWeight", width: 20 },
        { header: `Total ${reportType === 'Sales' ? 'Sales' : 'Purchases'} Bags`, key: "totalBags", width: 20 },
      ];

      let srNo = 1;
      const data = report;

      data.forEach((product) => {
        sheet.addRow({ srNo: srNo++, ...product });
      });

      sheet.eachRow((row, rowNumber) => {
        row.eachCell((cell) => {
          cell.alignment = {
            horizontal: "center",
            vertical: "middle",
          };
          if (rowNumber === 1) {
            cell.font = { bold: true };
          }
        });
      });

      const reportsDir = path.join("./reports");
      if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

      const timestamp = Date.now();
      const typeName = reportType.replace(/ /g, "");
      const fileName = `${typeName}_Report_${timestamp}.xlsx`;
      const filePath = path.join(reportsDir, fileName);

      await workbook.xlsx.writeFile(filePath);

      return res.download(filePath, fileName, (err) => {
        if (err) {
          console.error("Download error:", err);
          res.status(500).send("Could not download the report.");
        } else {
          fs.unlink(filePath, () => {}); // Optional: clean up after sending
        }
      });
    } else {
      // Return JSON response
      const formatDate = (d) => new Date(d).toLocaleDateString("en-GB");
      const filterName =
        startDate || endDate
          ? `${reportType} Report - ${
              startDate ? formatDate(startDate) : "..."
            } to ${endDate ? formatDate(endDate) : "..."}`
          : `${reportType} Report - All Time`;

      return res.status(200).json({
        success: true,
        report,
        filterName,
      });
    }
  } catch (err) {
    console.error("Error generating stock report:", err);
    res.status(500).json({ message: "Server Error", error: err.message });
  }
};

const getProductReport = async (req, res) => {
  try {
    const { productId } = req.params;
    const { startDate, endDate, type, download } = req.query;

    if (!["sales", "purchases"].includes(type)) {
      return res.status(400).json({ error: "Invalid report type" });
    }

    const isSales = type === "sales";
    const Model = isSales ? Sales : Purchase;
    const partyField = isSales ? "customerId" : "vendorId";
    const reportType = isSales ? "Sales" : "Purchases";

    let dateFilter = {};
    if (startDate || endDate) {
      const dateField = isSales ? "createdAt" : "purchaseDate";
      dateFilter[dateField] = {};
      if (startDate) dateFilter[dateField].$gte = new Date(startDate);
      if (endDate) dateFilter[dateField].$lte = new Date(endDate);
    }

    const records = await Model.find(dateFilter)
      .populate(partyField)
      .lean();

    const filtered = records
      .map((doc) => {
        const relevantItems = doc.items.filter(
          (item) => item.productId.toString() === productId
        );
        if (relevantItems.length === 0) return null;

        const partyName = doc[partyField]?.businessInformation?.businessName || "Unknown";

        // Calculate summary for each transaction's relevant items
        const summary = relevantItems.reduce(
          (acc, item) => {
            acc.totalQuantity += item.quantity;
            acc.totalBags += item.bag;
            acc.totalPrice += item.price;
            acc.totalAmount += item.total;
            acc.totalWeightKg += convertToKg(item.totalweight, item.unit);
            acc.totalWeight += item.totalweight;
            return acc;
          },
          {
            transactionId: doc._id, // Add transaction ID -  Important for identifying source
            vendorName: partyName,
            totalQuantity: 0,
            totalBags: 0,
            totalPrice: 0,
            totalAmount: 0,
            totalWeightKg: 0,
            totalWeight: 0,
            date: isSales ? doc.createdAt : doc.purchaseDate, //add date
          }
        );
        return summary;
      })
      .filter(Boolean);

    // Aggregate by vendor
    const aggregatedData = filtered.reduce((acc, item) => {
      if (!acc[item.vendorName]) {
        acc[item.vendorName] = {
          vendorName: item.vendorName,
          totalQuantity: 0,
          totalBags: 0,
          totalPrice: 0,
          totalAmount: 0,
          totalWeightKg: 0,
          totalWeight: 0,
          transactionIds: [], // Keep track of transaction IDs
          dates: [],
        };
      }
      acc[item.vendorName].totalQuantity += item.totalQuantity;
      acc[item.vendorName].totalBags += item.totalBags;
      acc[item.vendorName].totalPrice += item.totalPrice;
      acc[item.vendorName].totalAmount += item.totalAmount;
      acc[item.vendorName].totalWeightKg += item.totalWeightKg;
      acc[item.vendorName].totalWeight += item.totalWeight;
      acc[item.vendorName].transactionIds.push(item.transactionId); // Store the transaction ID
      acc[item.vendorName].dates.push(item.date);
      return acc;
    }, {});

    const result = Object.values(aggregatedData);


    if (download === "true") {
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet(`${reportType} Report`);

      const columns = [
        { header: isSales ? "Customer" : "Vendor", key: "vendorName", width: 30 },
        { header: "Total Weight (kg)", key: "totalWeightKg", width: 20 },
        { header: "Total Weight", key: "totalWeight", width: 20 },
        { header: "Total Bags", key: "totalBags", width: 20 },
        { header: "Total Quantity", key: "totalQuantity", width: 20 },
        { header: "Total Price", key: "totalPrice", width: 20 },
        { header: "Total Amount", key: "totalAmount", width: 20 },
      ];
      sheet.columns = columns;

      result.forEach((entry) => {
        sheet.addRow({
          vendorName: entry.vendorName,
          totalWeightKg: entry.totalWeightKg,
          totalWeight: entry.totalWeight,
          totalBags: entry.totalBags,
          totalQuantity: entry.totalQuantity,
          totalPrice: entry.totalPrice,
          totalAmount: entry.totalAmount,
        });
      });

      const headerRow = sheet.getRow(1);
      headerRow.eachCell((cell) => {
        cell.font = { bold: true };
      });

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
      res.setHeader("Content-Disposition", `attachment; filename=${reportType}_report.xlsx`);
      await workbook.xlsx.write(res);
      res.end();
    } else {
      res.json({ type, data: result });
    }
  } catch (err) {
    console.error("Error generating report:", err);
    res.status(500).json({ error: "Something went wrong." });
  }
};

const convertToKg = (weight, unit) => {
  switch (unit) {
    case "GRAM":
      return weight / 1000;
    case "TON":
      return weight * 1000;
    case "KG":
    default:
      return weight;
  }
};


export {
  generateCustomerReport,
  generateSalesReport,
  getCustomerInvoiceReport,
  getOverallReport,
  getPartyWiseReport,
  getProductReport,
  getProductWiseReport,
  getStockSummaryReport,
};
