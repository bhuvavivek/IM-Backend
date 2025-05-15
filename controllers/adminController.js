import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import Admin from "../models/Admin.js";

// Hardcoded Admin Registration (Run Once)
export const createAdmin = async (req, res) => {
  try {
    const adminExists = await Admin.findOne({ username: "admin" });
    if (!adminExists) {
      const hashedPassword = await bcrypt.hash("Ramdev@2025", 10);
      await Admin.create({
        username: "Ramdev Agro",
        password: hashedPassword,
        email: "ramdevagroindustries2025@gmail.com",
      });
      return res.json({ message: "admin created" });
    }

    return res.status(400).json({ message: "already exist" });
  } catch (error) {
    console.log(error);
    return res.status(500).json({ message: "something went wrong", error });
  }
};

// Admin Login
export const loginAdmin = async (req, res) => {
  try {
    const { email, password } = req.body;

    const admin = await Admin.findOne({ email });
    if (!admin) return res.status(400).json({ message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, admin.password);
    if (!isMatch)
      return res.status(400).json({ message: "Invalid credentials" });

    const adminWithoutPassword = { ...admin.toObject() };
    delete adminWithoutPassword.password;

    const token = jwt.sign({ id: admin._id }, process.env.JWT_SECRET, {
      expiresIn: "24h",
    });
    res.json({ accessToken: token, user: adminWithoutPassword });
  } catch (error) {
    console.log(error);
  }
};

export const getProfile = async (req, res) => {
  try {
    // Fetch the admin's profile, excluding the password
    const admin = await Admin.findById(req.adminId).select("-password");

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" }); //Should not happen, unless deleted.
    }

    res.json({ user: admin });
  } catch (error) {
    console.error("Error fetching admin profile:", error);
    res.status(500).json({ message: "Internal server error" });
  }
};
