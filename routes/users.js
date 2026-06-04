const express = require('express');
const auth = require('../middleware/auth');
const User = require('../models/User');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const router = express.Router();

// إعداد multer لرفع الصور
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadPath = 'uploads/profile';
    // تأكد من وجود المجلد
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    cb(null, 'profile-' + req.user.id + '-' + uniqueSuffix + path.extname(file.originalname));
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 ميجا max
  fileFilter: (req, file, cb) => {
    const filetypes = /jpeg|jpg|png|gif|webp/;
    const extname = filetypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = filetypes.test(file.mimetype);
    if (extname && mimetype) {
      return cb(null, true);
    }
    cb(new Error('صور فقط (jpeg, jpg, png, gif, webp)'));
  }
});

// GET /api/users/me - جلب بيانات المستخدم الحالي
router.get('/me', auth, async (req, res) => {
  try {
    const user = await User.findById(req.user.id).select('-password');
    if (!user) return res.status(404).json({ msg: 'المستخدم غير موجود' });

    // إضافة الـ full URL للصورة
    if (user.profileImage && !user.profileImage.startsWith('http')) {
      user.profileImage = `${req.protocol}://${req.get('host')}/uploads/profile/${user.profileImage}`;
    }

    res.json(user);
  } catch (err) {
    console.error('خطأ في جلب البروفايل:', err);
    res.status(500).json({ msg: 'خطأ في السيرفر' });
  }
});

// PUT /api/users/profile - تحديث البيانات والصورة
router.put('/profile', auth, upload.single('profileImage'), async (req, res) => {
  try {
    const updates = {
      name: req.body.name,
      phone: req.body.phone || ''
    };

    // لو في صورة جديدة
    if (req.file) {
      // احذف الصورة القديمة لو موجودة ومش default
      const user = await User.findById(req.user.id);
      if (user.profileImage && user.profileImage !== 'default.jpg') {
        const oldPath = path.join(__dirname, '..', 'uploads', 'profile', path.basename(user.profileImage));
        if (fs.existsSync(oldPath)) {
          fs.unlinkSync(oldPath);
        }
      }
      updates.profileImage = req.file.filename;
    }

    const updatedUser = await User.findByIdAndUpdate(
      req.user.id,
      updates,
      { new: true }
    ).select('-password');

    // إضافة الـ full URL للصورة
    if (updatedUser.profileImage && !updatedUser.profileImage.startsWith('http')) {
      updatedUser.profileImage = `${req.protocol}://${req.get('host')}/uploads/profile/${updatedUser.profileImage}`;
    }

    res.json(updatedUser);
  } catch (err) {
    console.error('خطأ في تحديث البروفايل:', err);
    res.status(500).json({ msg: 'خطأ في حفظ التغييرات' });
  }
});

// الحفاظ على الـ route القديم لو حد بيستخدمه (اختياري)
router.patch('/:id', auth, async (req, res) => {
  if (req.params.id !== req.user.id) return res.status(403).json({ msg: 'غير مصرح' });

  try {
    const user = await User.findByIdAndUpdate(req.params.id, req.body, { new: true }).select('-password');
    if (!user) return res.status(404).json({ msg: 'المستخدم غير موجود' });

    if (user.profileImage && !user.profileImage.startsWith('http')) {
      user.profileImage = `${req.protocol}://${req.get('host')}/uploads/profile/${user.profileImage}`;
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ msg: 'خطأ في التحديث' });
  }
});

module.exports = router;