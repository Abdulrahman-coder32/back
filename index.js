// ====================== POLYFILL للـ crypto ======================
const crypto = require('crypto');
global.crypto = crypto; // مهم جداً لـ Hostinger

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const http = require('http');
const socketIo = require('socket.io');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const path = require('path');

const Message = require('./models/Message');
const Application = require('./models/Application');
const Notification = require('./models/Notification');

dotenv.config();

if (!process.env.MONGO_URI) {
  console.error("❌ MONGO_URI مش موجود!");
  process.exit(1);
}

const app = express();
const server = http.createServer(app);

const io = socketIo(server, {
  cors: { 
    origin: process.env.CLIENT_URL || "*", 
    credentials: true 
  }
});

app.set('io', io);

// Middlewares
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cors({
  origin: process.env.CLIENT_URL,
  credentials: true
}));

app.use((req, res, next) => {
  console.log(`📌 ${req.method} ${req.url}`);
  next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/users', require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));

app.get('/api/test', (req, res) => res.json({ message: '✅ Backend شغال' }));

// ====================== SOCKET.IO SETUP ======================
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error('لا يوجد توكن'));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = { id: decoded.id, role: decoded.role };
    next();
  } catch (err) {
    next(new Error('توكن غير صالح'));
  }
});

io.on('connection', (socket) => {
  console.log('✅ مستخدم متصل:', socket.user?.id);

  if (socket.user?.id) {
    socket.join(socket.user.id.toString());
  }

  // الانضمام لشات معين
  socket.on('joinChat', (applicationId) => {
    socket.join(applicationId);
    console.log(`👥 User ${socket.user.id} joined chat: ${applicationId}`);
  });

  // إرسال رسالة عبر Socket (أهم تعديل)
  socket.on('sendMessage', async ({ application_id, message }) => {
    if (!message?.trim() || !application_id) return;

    try {
      const newMessage = new Message({
        application_id,
        sender_id: socket.user.id,
        type: 'text',
        message: message.trim(),
        timestamp: new Date()
      });

      await newMessage.save();

      const populatedMessage = await Message.findById(newMessage._id)
        .populate('sender_id', 'name profileImage cacheBuster');

      // إرسال الرسالة لكل الموجودين في الروم
      io.to(application_id).emit('newMessage', populatedMessage);

      console.log(`📨 Message sent in chat ${application_id}`);
      
      // هنا يمكن استدعاء دالة handleNewMessage من routes/messages.js لو حابب نعمل refactor كبير
      // لكن حالياً بنعمل emit أساسي

    } catch (err) {
      console.error('❌ Socket sendMessage Error:', err);
      socket.emit('messageError', { msg: 'فشل في إرسال الرسالة' });
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ مستخدم انفصل:', socket.user?.id);
  });
});

// ====================== START SERVER ======================
const startServer = async () => {
  try {
    console.log("🔗 Connecting to MongoDB...");
    await mongoose.connect(process.env.MONGO_URI, {
      serverSelectionTimeoutMS: 15000,
    });
    console.log('✅ MongoDB connected successfully');

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  } catch (err) {
    console.error('❌ MongoDB Error:', err.message);
    process.exit(1);
  }
};

startServer();
