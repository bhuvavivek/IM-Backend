import jwt from 'jsonwebtoken'

const verifyToken = (req, res, next) => {
  const token = req.header('Authorization')?.split(' ')[1];

  
  if (!token) {
    return res.status(401).json({ message: 'No token provided' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.adminId = decoded.id; // Store admin ID for later use
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Invalid token' });
  }
};

export {verifyToken}