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

// ====================== SOCKET ======================
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || true,
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.set('io', io);

// ====================== MIDDLEWARES ======================
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.use(cors({
  origin: process.env.CLIENT_URL || true,
  credentials: true
}));

app.use((req, res, next) => {
  console.log(`📌 ${req.method} ${req.url}`);
  next();
});

app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// ====================== ROUTES ======================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/users', require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));

app.get('/api/test', (req, res) => {
  res.json({ message: '✅ Backend شغال' });
});

// ====================== SOCKET AUTH ======================
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

// ====================== SOCKET LOGIC ======================
io.on('connection', (socket) => {
  console.log('✅ مستخدم متصل:', socket.user?.id);

  if (socket.user?.id) {
    socket.join(socket.user.id.toString());
  }

  socket.on('joinChat', (applicationId) => {
    socket.join(applicationId);
  });

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

      io.to(application_id).emit('newMessage', populatedMessage);

    } catch (err) {
      console.error('❌ Socket Error:', err);
      socket.emit('messageError', { msg: 'فشل في إرسال الرسالة' });
    }
  });

  socket.on('disconnect', () => {
    console.log('❌ مستخدم انفصل:', socket.user?.id);
  });
});

// ====================== DB + START ======================
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on port ${PORT}`);
    });
  })
  .catch(err => {
    console.error('❌ Mongo Error:', err);
  });
