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

const app = express();
const server = http.createServer(app);

// ================= SOCKET =================
const io = socketIo(server, {
  cors: {
    origin: process.env.CLIENT_URL || true,
    methods: ["GET", "POST"],
    credentials: true
  }
});

app.set('io', io);

// ================= MIDDLEWARE =================
app.use(express.json());
app.use(cors({ origin: process.env.CLIENT_URL || true }));

// ================= ROUTES =================
app.use('/api/auth', require('./routes/auth'));
app.use('/api/jobs', require('./routes/jobs'));
app.use('/api/applications', require('./routes/applications'));
app.use('/api/messages', require('./routes/messages'));
app.use('/api/users', require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));

// ================= SOCKET AUTH =================
io.use((socket, next) => {
  const token = socket.handshake.auth?.token;

  if (!token) return next(new Error('No token'));

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    socket.user = { id: decoded.id, role: decoded.role };
    next();
  } catch (err) {
    next(new Error('Invalid token'));
  }
});

// ================= SOCKET MAIN =================
io.on('connection', (socket) => {

  console.log('🟢 Connected:', socket.user.id);

  socket.join(socket.user.id.toString());

  socket.on('joinChat', (applicationId) => {
    socket.join(applicationId);
  });

  // ================= SEND MESSAGE =================
  socket.on('sendMessage', async ({ application_id, message }) => {

    if (!message?.trim() || !application_id) return;

    try {
      // 1. Save message
      const newMessage = await Message.create({
        application_id,
        sender_id: socket.user.id,
        type: 'text',
        message: message.trim(),
        timestamp: new Date()
      });

      const populatedMessage = await Message.findById(newMessage._id)
        .populate('sender_id', 'name profileImage cacheBuster');

      // 2. broadcast message to chat room
      io.to(application_id).emit('newMessage', populatedMessage);

      // 3. get application
      const appData = await Application.findById(application_id)
        .populate('job_id', 'owner_id')
        .populate('seeker_id', 'name');

      if (!appData) return;

      const ownerId = appData.job_id.owner_id.toString();
      const seekerId = appData.seeker_id._id.toString();

      const recipientId =
        socket.user.id === ownerId ? seekerId : ownerId;

      // 4. create notification
      const notification = await Notification.create({
        user_id: recipientId,
        type: 'new_message',
        message: `رسالة جديدة من ${populatedMessage.sender_id.name}`,
        application_id,
        read: false,
        createdAt: new Date()
      });

      // 5. count unread notifications (REAL FIX)
      const unreadCount = await Notification.countDocuments({
        user_id: recipientId,
        read: false
      });

      // 6. emit real-time updates
      io.to(recipientId).emit('newNotification', notification);

      io.to(recipientId).emit('unreadUpdate', {
        application_id,
        unreadCount
      });

      io.to(recipientId).emit('chatListUpdate', {
        application_id,
        lastMessage: message.trim(),
        updatedAt: new Date()
      });

    } catch (err) {
      console.error('❌ Socket Error:', err);
      socket.emit('messageError', { msg: 'Error sending message' });
    }
  });

  socket.on('disconnect', () => {
    console.log('🔴 Disconnected:', socket.user.id);
  });
});

// ================= DB =================
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log('✅ MongoDB connected');

    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`🚀 Server running on ${PORT}`);
    });
  })
  .catch(err => {
    console.error(err);
  });
