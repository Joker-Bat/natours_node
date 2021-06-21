const crypto = require('crypto');
const mongoose = require('mongoose');
const validator = require('validator');
const bcrypt = require('bcryptjs');

const userSchema = mongoose.Schema({
  name: {
    type: String,
    required: [true, 'Please tell us your name'],
  },
  email: {
    type: String,
    required: [true, 'Please provide your email'],
    unique: true,
    lowercase: true,
    validate: [validator.isEmail, 'Please provide a valid email'],
  },
  photo: {
    type: String,
    default: 'default.jpg',
  },
  role: {
    type: String,
    default: 'user',
    enum: ['user', 'guide', 'lead-guide', 'admin'],
  },
  password: {
    type: String,
    required: [true, 'Please provide a password'],
    minlength: 8,
    select: false,
  },
  passwordConform: {
    type: String,
    required: [true, 'Please provide a password'],
    validate: {
      // This only works on CREATE and SAVE!!!
      validator: function (val) {
        return this.password === val;
      },
      message: 'Password are not equal!',
    },
  },
  passwordChangedAt: Date,
  passwordResetToken: String,
  passwordResetExpires: Date,
  active: {
    type: Boolean,
    default: true,
    select: false,
  },
});

userSchema.pre('save', async function (next) {
  // Only run this when password is modified
  if (!this.isModified('password')) return next();
  // Hash the password with code 12 based on code it takes time
  this.password = await bcrypt.hash(this.password, 12);
  // We no longer need passwordConform to store it in database
  this.passwordConform = undefined;
  next();
});

// 3) Update passwordChangedAt property for current user
userSchema.pre('save', function (next) {
  if (!this.isModified('password') || this.isNew) return next();

  // -1000 for simple hack for practical reason
  this.passwordChangedAt = Date.now() - 1000;
  next();
});
/**
 * Query middlewere
 */
userSchema.pre(/^find/, function (next) {
  // this points to current query
  this.find({ active: { $ne: false } });
  next();
});

userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = function (JWTTimeStamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );
    return JWTTimeStamp < changedTimestamp; //100 < 200
  }
  // False means not changed
  return false;
};

userSchema.methods.createPasswordResetToken = function () {
  const resetToken = crypto.randomBytes(32).toString('hex');

  this.passwordResetToken = crypto
    .createHash('sha256')
    .update(resetToken)
    .digest('hex');

  // Token valid for 10min
  this.passwordResetExpires = Date.now() + 10 * 60 * 1000;
  console.log({
    resetToken,
    passwordResetToken: this.passwordResetToken,
    passwordResetExpires: this.passwordResetExpires,
  });

  return resetToken;
};

const User = mongoose.model('User', userSchema);

module.exports = User;
