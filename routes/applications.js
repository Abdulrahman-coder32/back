const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Application = require('../models/Application');
const JobListing = require('../models/JobListing');
const Notification = require('../models/Notification'); // ← جديد: لحفظ الإشعارات في الـ DB

router.post('/', auth, async (req, res) => {
  if (req.user.role !== 'job_seeker') return res.status(403).json({ msg: 'غير مصرح' });

  const { job_id, message } = req.body;

  try {
    const job = await JobListing.findById(job_id).populate('owner_id', 'name');
    if (!job) return res.status(404).json({ msg: 'الوظيفة غير موجودة' });

    const existing = await Application.findOne({ job_id, seeker_id: req.user.id });
    if (existing) return res.status(400).json({ msg: 'لقد قدمت على هذه الوظيفة مسبقًا' });

    const application = new Application({
      job_id,
      seeker_id: req.user.id,
      message: message?.trim() || ''
    });
    await application.save();

    const populatedApp = await Application.findById(application._id)
      .populate('seeker_id', 'name email governorate city age work_experience')
      .populate('job_id');

    const io = req.app.get('io');

    if (io) {
      const notificationData = {
        type: 'new_application',
        message: `تقديم جديد من ${populatedApp.seeker_id.name} على وظيفتك "${job.shop_name}"`,
        application_id: application._id,
        read: false,
        createdAt: new Date()
      };

      // إرسال الإشعار عبر السوكت
      io.to(job.owner_id._id.toString()).emit('newNotification', notificationData);

      // حفظ في الـ database
      const newNotif = new Notification({
        user_id: job.owner_id._id,
        ...notificationData
      });
      await newNotif.save();

      // الإشعار القديم (اختياري)
      io.to(job.owner_id._id.toString()).emit('newApplication', {
        type: 'new_application',
        application: populatedApp,
        message: `تقديم جديد من ${populatedApp.seeker_id.name} على وظيفتك "${job.shop_name}"`
      });
    }

    res.json(populatedApp);
  } catch (err) {
    console.error('خطأ في التقديم:', err);
    res.status(500).json({ msg: 'خطأ في السيرفر' });
  }
});

// جلب تقديماتي كـ job_seeker
router.get('/my', auth, async (req, res) => {
  if (req.user.role !== 'job_seeker') {
    return res.status(403).json({ msg: 'غير مصرح - يجب أن تكون باحثًا عن عمل' });
  }

  try {
    const apps = await Application.find({ seeker_id: req.user.id })
      .populate('job_id')
      .sort({ createdAt: -1 });
    res.json(apps);
  } catch (err) {
    console.error('خطأ في جلب تقديماتي:', err);
    res.status(500).json({ msg: 'خطأ' });
  }
});

// جلب كل التقديمات على وظائفي كـ shop_owner
router.get('/my-jobs', auth, async (req, res) => {
  if (req.user.role !== 'shop_owner') {
    return res.status(403).json({ msg: 'غير مصرح - يجب أن تكون صاحب عمل' });
  }

  try {
    const jobs = await JobListing.find({ owner_id: req.user.id }).select('_id');
    const jobIds = jobs.map(j => j._id);

    if (jobIds.length === 0) {
      return res.json([]);
    }

    const apps = await Application.find({ job_id: { $in: jobIds } })
      .populate('seeker_id', 'name email governorate city age work_experience')
      .populate('job_id', 'shop_name category')
      .sort({ createdAt: -1 });

    res.json(apps);
  } catch (err) {
    console.error('خطأ في جلب تقديمات وظائفي:', err);
    res.status(500).json({ msg: 'خطأ في السيرفر' });
  }
});

// جلب تقديمات وظيفة معينة
router.get('/job/:jobId', auth, async (req, res) => {
  try {
    const job = await JobListing.findById(req.params.jobId);
    if (!job || job.owner_id.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'غير مصرح' });
    }

    const apps = await Application.find({ job_id: req.params.jobId })
      .populate('seeker_id', 'name email governorate city age work_experience')
      .sort({ createdAt: -1 });

    res.json(apps);
  } catch (err) {
    console.error('خطأ في جلب تقديمات الوظيفة:', err);
    res.status(500).json({ msg: 'خطأ' });
  }
});

// قبول أو رفض التقديم
router.patch('/:id', auth, async (req, res) => {
  const { status } = req.body;
  if (!['accepted', 'rejected'].includes(status)) {
    return res.status(400).json({ msg: 'حالة غير صالحة' });
  }

  try {
    const app = await Application.findById(req.params.id)
      .populate('job_id seeker_id');

    if (!app) return res.status(404).json({ msg: 'التقديم غير موجود' });
    if (app.job_id.owner_id.toString() !== req.user.id) {
      return res.status(403).json({ msg: 'غير مصرح' });
    }

    app.status = status;
    await app.save();

    const populatedApp = await Application.findById(app._id)
      .populate('job_id seeker_id');

    const io = req.app.get('io');

    if (io) {
      const statusMessage = status === 'accepted'
        ? `تم قبول تقديمك على وظيفة "${app.job_id.shop_name}"! يمكنك الآن الدردشة مع صاحب العمل 🎉`
        : `تم رفض تقديمك على وظيفة "${app.job_id.shop_name}" 😔`;

      const notifType = status === 'accepted' ? 'application_accepted' : 'application_rejected';

      const seekerNotificationData = {
        type: notifType,
        message: statusMessage,
        application_id: app._id,
        read: false,
        createdAt: new Date()
      };

      // إشعار للمتقدم
      io.to(app.seeker_id._id.toString()).emit('newNotification', seekerNotificationData);

      // حفظ في الـ DB للمتقدم
      const seekerNotif = new Notification({
        user_id: app.seeker_id._id,
        ...seekerNotificationData
      });
      await seekerNotif.save();

      // الإشعار القديم
      io.to(app.seeker_id._id.toString()).emit('applicationStatusUpdate', {
        type: 'status_update',
        application_id: app._id,
        status: status,
        message: statusMessage
      });

      // إشعار لصاحب العمل عند القبول فقط
      if (status === 'accepted') {
        const ownerNotificationData = {
          type: 'application_accepted',
          message: `تم قبول المتقدم ${app.seeker_id.name}، الدردشة مفتوحة الآن`,
          application_id: app._id,
          read: false,
          createdAt: new Date()
        };

        io.to(app.job_id.owner_id.toString()).emit('newNotification', ownerNotificationData);

        // حفظ في الـ DB لصاحب العمل
        const ownerNotif = new Notification({
          user_id: app.job_id.owner_id,
          ...ownerNotificationData
        });
        await ownerNotif.save();

        // الإشعار القديم
        io.to(app.job_id.owner_id.toString()).emit('chatOpened', {
          type: 'chat_opened',
          application_id: app._id,
          seeker_name: app.seeker_id.name,
          message: `تم قبول المتقدم ${app.seeker_id.name}، الدردشة مفتوحة الآن`
        });
      }
    }

    res.json(populatedApp);
  } catch (err) {
    console.error('خطأ في تحديث الحالة:', err);
    res.status(500).json({ msg: 'خطأ في السيرفر' });
  }
});

module.exports = router;