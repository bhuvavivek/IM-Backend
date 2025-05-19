import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import ConnectMongodb from "./config/db.js";
import Customer from "./models/Customer.js";
import Expense from "./models/Expense.js";
import Invoice from "./models/Invoice.js";
import Product from "./models/Product.js";
import Purchase from "./models/Purchase.js";
import Sales from "./models/Sales.js";
import Stock from "./models/Stock.js";
import Vendor from "./models/Vendor.js";
import adminRoutes from "./routes/adminRoutes.js";
import customerRoutes from "./routes/customerRoute.js";
import expenseRoutes from "./routes/expenseRoutes.js";
import InvoiceRoutes from "./routes/InvoiceRoute.js";
import productRoutes from "./routes/productRoutes.js";
import purchaseRoutes from "./routes/purchaseRoutes.js";
import reportRoutes from "./routes/reportRoutes.js";
import salesRoutes from "./routes/salesRoutes.js";
import stockRoutes from "./routes/stockRoutes.js";
import vendorRoutes from "./routes/vendorRoutes.js";
import bankRoutes from './routes/bank-ledger-Route.js'
import { verifyToken } from "./middleware/authMiddleware.js";

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Root Route
app.get("/", (req, res) => {
  res.send('<h1 style="color:red">Great! You Are On The Right Path</h1>');
});

app.use("/api/auth", adminRoutes);

app.use(verifyToken)
app.use("/api/product", productRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/invoices", InvoiceRoutes);
app.use("/api/expense", expenseRoutes);
app.use("/api/customers", customerRoutes);
app.use("/api/reports", reportRoutes);
app.use("/api/bank", bankRoutes );


const clearDB = async (req, res) => {
  try {
    await Product.deleteMany({});
    await Stock.deleteMany({});
    await Purchase.deleteMany({});
    await Sales.deleteMany({});
    await Customer.deleteMany({});
    await Vendor.deleteMany({});
    await Expense.deleteMany({});
    await Invoice.deleteMany({});

    res.status(200).json({ message: "Database cleared" });
  } catch (error) {
    res.status(500).json({ message: "Error clearing database", error });
  }
};

app.use("/clean", clearDB);

async function startServer() {
  try {
    await ConnectMongodb(process.env.MONGO_URI);
    app.listen(port, () => {
      console.log(`Server is running on http://localhost:${port}`);
    });
  } catch (error) {
    console.error("MongoDB connection failed. Server not started.", error);
    process.exit(1);
  }
}

startServer();
