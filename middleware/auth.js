const jwt = require('jsonwebtoken');

module.exports = (req, res, next) => {
  console.log('Auth Middleware: Headers received:', req.headers.authorization);

  const authHeader = req.header('Authorization') || req.header('authorization');

  if (!authHeader) {
    console.log('No token provided');
    return res.status(401).json({ msg: 'لا يوجد توكن، الوصول مرفوض' });
  }

  if (!authHeader.startsWith('Bearer ')) {
    console.log('Invalid token format');
    return res.status(401).json({ msg: 'صيغة التوكن غير صحيحة' });
  }

  const token = authHeader.split(' ')[1];
  console.log('Token extracted:', token ? 'Yes' : 'No');

  if (!token) {
    console.log('Token is empty');
    return res.status(401).json({ msg: 'توكن فارغ' });
  }

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    console.log('Token valid, user ID:', decoded.id, 'Role:', decoded.role);
    req.user = { id: decoded.id, role: decoded.role };
    next();
  } catch (err) {
    console.log('Token verification failed:', err.message);
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ msg: 'التوكن منتهي الصلاحية' });
    }
    if (err.name === 'JsonWebTokenError') {
      return res.status(401).json({ msg: 'توكن غير صالح' });
    }
    return res.status(401).json({ msg: 'فشل في المصادقة' });
  }
};