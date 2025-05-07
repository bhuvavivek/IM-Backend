import ExcelJS from "exceljs";
import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import Customer from "../models/Customer.js";
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

const generateCustomerPurchaseReport = async (req, res) => {
  try {
    const { startDate, endDate } = req.query;

    const sales = await Sales.find({
      createdAt: {
        $gte: new Date(startDate),
        $lte: new Date(endDate),
      },
    })
      .populate("customerId")
      .exec();

    const customerMap = {};

    // Aggregate data
    sales.forEach((invoice) => {
      const customerName = invoice.customerId.businessInformation.businessName;

      if (!customerMap[customerName]) {
        customerMap[customerName] = {};
      }

      invoice.items.forEach((item) => {
        const productKey = item.name + "-" + item.bagsize;
        if (!customerMap[customerName][productKey]) {
          customerMap[customerName][productKey] = {
            productName: item.name,
            unit: item.unit,
            totalQuantity: 0,
            totalBags: 0,
            totalWeight: 0,
            totalAmount: 0,
          };
        }

        customerMap[customerName][productKey].totalQuantity += item.quantity;
        customerMap[customerName][productKey].totalBags += item.bag;
        customerMap[customerName][productKey].totalWeight += item.totalweight;
        customerMap[customerName][productKey].totalAmount += item.total;
      });
    });

    const workbook = new ExcelJS.Workbook();

    for (const [customer, productData] of Object.entries(customerMap)) {
      const sheet = workbook.addWorksheet(customer.substring(0, 31)); // Excel tab name limit

      let data = Object.values(productData);

      let totalAmount = 0;
      let totalWeight = 0;
      let maxWeight = -Infinity;
      let minWeight = Infinity;
      let mostPurchased = null;
      let leastPurchased = null;

      data.forEach((p) => {
        totalAmount += p.totalAmount;
        totalWeight += p.totalWeight;

        if (p.totalWeight > maxWeight) {
          maxWeight = p.totalWeight;
          mostPurchased = p.productName;
        }

        if (p.totalWeight < minWeight) {
          minWeight = p.totalWeight;
          leastPurchased = p.productName;
        }
      });

      sheet.columns = [
        { header: "Product", key: "productName", width: 25 },
        { header: "Unit", key: "unit", width: 10 },
        { header: "Quantity", key: "totalQuantity", width: 12 },
        { header: "Bags", key: "totalBags", width: 10 },
        { header: "Weight", key: "totalWeight", width: 15 },
        { header: "Amount (Rs)", key: "totalAmount", width: 15 },
        { header: "% by Amount", key: "percentAmount", width: 15 },
        { header: "% by Weight", key: "percentWeight", width: 15 },
      ];

      data.forEach((p) => {
        const percentAmount =
          totalAmount > 0
            ? ((p.totalAmount / totalAmount) * 100).toFixed(2) + "%"
            : "0%";
        const percentWeight =
          totalWeight > 0
            ? ((p.totalWeight / totalWeight) * 100).toFixed(2) + "%"
            : "0%";
        sheet.addRow({ ...p, percentAmount, percentWeight });
      });

      sheet.addRow({});
      sheet.addRow([
        "Most Purchased Product",
        "",
        "",
        "",
        `${mostPurchased} (${maxWeight} ${data[0]?.unit})`,
      ]);
      sheet.addRow([
        "Least Purchased Product",
        "",
        "",
        "",
        `${leastPurchased} (${minWeight} ${data[0]?.unit})`,
      ]);
      sheet.addRow(["Total Amount", "", "", "", "", totalAmount]);
      sheet.addRow(["Total Weight", "", "", "", "", totalWeight]);
    }

    // Save Excel file
    const reportsDir = path.join(process.cwd(), "reports");
    if (!fs.existsSync(reportsDir)) {
      fs.mkdirSync(reportsDir, { recursive: true });
    }

    const filePath = path.join(
      reportsDir,
      `customer_report_${Date.now()}.xlsx`
    );
    await workbook.xlsx.writeFile(filePath);

    console.log(`✅ Excel report generated: ${filePath}`);

    // Send file for download
    res.download(filePath, (err) => {
      if (err) {
        console.error("❌ Error downloading file:", err);
        res.status(500).send("Error downloading file");
      }

      // Cleanup after download
      fs.unlink(filePath, (unlinkErr) => {
        if (unlinkErr) {
          console.error("❌ Error deleting file:", unlinkErr);
        }
      });
    });
  } catch (error) {
    console.error("❌ Error generating Excel report:", error);
    res.status(500).send("Error generating report");
  }
};

export {
  generateCustomerPurchaseReport,
  generateCustomerReport,
  generateDetailedInvoiceReport,
  generateSalesReport,
  getOverallReport,
  getPartyWiseReport,
  getProductWiseReport,
};
