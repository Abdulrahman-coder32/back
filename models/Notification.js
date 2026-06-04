// models/Notification.js
const mongoose = require('mongoose');

const NotificationSchema = new mongoose.Schema({
  user_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    required: true
  },
  message: {
    type: String,
    required: true
  },
  application_id: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application'
  },
  read: {
    type: Boolean,
    default: false
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// الجزء ده هو اللي بيحل المشكلة
const Notification = mongoose.model('Notification', NotificationSchema);

module.exports = Notification;   // ← لازم يكون كده، مش NotificationSchema ولا أي حاجة تانية