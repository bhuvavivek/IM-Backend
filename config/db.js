import mongoose from "mongoose";

export default async function ConnectMongodb(URL){
    try {
        await mongoose.connect(URL);
        console.log("MongoDB connected successfully");
     } catch (error) {
        console.error("MongoDB connection error:", error);
        process.exit(1); // Exit process on failure
     }
}