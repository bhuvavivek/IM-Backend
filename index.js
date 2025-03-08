import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import ConnectMongodb from "./config/db.js";
import adminRoutes from "./routes/adminRoutes.js";
import InvoiceRoutes from "./routes/InvoiceRoute.js";
import productRoutes from "./routes/productRoutes.js";
import purchaseRoutes from "./routes/purchaseRoutes.js";
import salesRoutes from "./routes/salesRoutes.js";
import stockRoutes from "./routes/stockRoutes.js";
import vendorRoutes from "./routes/vendorRoutes.js";

dotenv.config();
const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// Root Route
app.get("/", (req, res) => {
  res.send('<h1 style="color:red">Great! You Are On The Right Path</h1>');
});

app.use("/api/admin", adminRoutes);
app.use("/api/product", productRoutes);
app.use("/api/stock", stockRoutes);
app.use("/api/purchases", purchaseRoutes);
app.use("/api/vendors", vendorRoutes);
app.use("/api/sales", salesRoutes);
app.use("/api/invoices", InvoiceRoutes);

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
