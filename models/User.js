const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['shop_owner', 'job_seeker', 'admin'], required: true },
  name: String,
  age: Number,
  governorate: { type: String, required: true },
  city: { type: String, required: true },
  work_experience: String,
  desired_job_type: String,
  shop_name: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);