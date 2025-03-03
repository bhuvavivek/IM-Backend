import dotenv from "dotenv";
import express from "express";
import ConnectMongodb from "./config/db.js";
import cors from 'cors'
import adminRoutes from './routes/adminRoutes.js'
import productRoutes from './routes/productRoutes.js'
import stockRoutes from './routes/stockRoutes.js';



dotenv.config();
const app = express();
const port = process.env.PORT || 3000;


app.use(cors());
app.use(express.json());

// Root Route
app.get("/", (req, res) => {
    res.send('<h1 style="color:red">Great! You Are On The Right Path</h1>');
});

app.use('/api/admin', adminRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stock', stockRoutes);


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