const crypto = require('crypto');
const { promisify } = require('util');
const jwt = require('jsonwebtoken');
const User = require('../models/userModel');
const catchAsync = require('../utils/catchAsync');
const AppError = require('../utils/appError');
const Email = require('../utils/email');

/**
 * ? Get Token
 **/

const signToken = (id) =>
  jwt.sign({ id }, process.env.JWT_TOKEN, {
    expiresIn: process.env.JWT_EXPIRES_IN,
  });

const createSendToken = (user, statusCode, res) => {
  const token = signToken(user._id);

  const cookieOptions = {
    maxAge: new Date(
      Date.now() +
        process.env.JWT_COOKIE_EXPIRES_IN * 24 * 60 * 60 * 1000
    ),
    httpOnly: true,
  };
  // Make it as secure only in production
  if (process.env.NODE_ENV === 'production') {
    cookieOptions.secure = true;
  }

  res.cookie('jwt', token, cookieOptions);

  // Remove password from output
  user.password = undefined;

  res.status(statusCode).json({
    status: 'success',
    token,
    data: {
      user,
    },
  });
};
/**
 * ?  Signup
 **/
exports.signup = catchAsync(async (req, res, next) => {
  const newUser = await User.create({
    name: req.body.name,
    email: req.body.email,
    password: req.body.password,
    passwordConform: req.body.passwordConform,
    role: req.body.role,
  });
  const url = `${req.protocol}://${req.get('host')}/me`;
  console.log(url);
  await new Email(newUser, url).sendWelcome();
  // In mongoDB id is _id
  createSendToken(newUser, 201, res);
});

/**
 *  ? Login
 **/

exports.login = catchAsync(async (req, res, next) => {
  const { email, password } = req.body;

  // 1) Check if email and password exists
  if (!email || !password) {
    return next(
      new AppError('Please provide email and password!', 400)
    );
  }

  // 2) Check if user Exists and password Matches
  const user = await User.findOne({ email }).select('+password');
  // Document instance methods see it in userModel
  if (
    !user ||
    !(await user.correctPassword(password, user.password))
  ) {
    return next(
      new AppError('Email and password does not match!', 401)
    );
  }

  // 3) If everything is ok then send a JWT token to client
  createSendToken(user, 200, res);
});

/**
 * ?  Protect
 **/

exports.protect = catchAsync(async (req, res, next) => {
  // 1) Get token and Check if its there
  let token;
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    token = req.headers.authorization.split(' ')[1];
  } else if (req.cookies.jwt) {
    token = req.cookies.jwt;
  }

  if (!token) {
    return next(
      new AppError(
        'You are not logged in! Please log in to continue',
        401
      )
    );
  }
  // 2) Check it its a valid Token
  const decoded = await promisify(jwt.verify)(
    token,
    process.env.JWT_TOKEN
  );

  // 3) Check if user still exists
  const currentUser = await User.findById(decoded.id);

  if (!currentUser)
    return next(
      new AppError(
        'The user belonging to this token no longer exist',
        401
      )
    );

  // 4) Check if user changed password after the token issued
  if (currentUser.changedPasswordAfter(decoded.iat)) {
    return next(
      new AppError(
        'User recently changed password! login again.',
        401
      )
    );
  }

  // Grand access to protected routes
  req.user = currentUser;
  // ! All our pug templates have access to {res.locals.[value]}
  res.locals.user = currentUser;
  next();
});

/**
 * ? Check isLoggedIn for render pages, not for errors
 **/

exports.isLoggedIn = async (req, res, next) => {
  if (req.cookies.jwt) {
    try {
      // 1) verify token
      const decoded = await promisify(jwt.verify)(
        req.cookies.jwt,
        process.env.JWT_TOKEN
      );

      // 2) Check if user still exists
      const currentUser = await User.findById(decoded.id);

      if (!currentUser) return next();

      // 3) Check if user changed password after the token issued
      if (currentUser.changedPasswordAfter(decoded.iat)) {
        return next();
      }

      // There is a logged in user
      // ! All our pug templates have access to {res.locals.[value]}
      res.locals.user = currentUser;
      return next();
    } catch (err) {
      return next();
    }
  }
  next();
};

/**
 * ?  Logout
 **/

exports.logout = (req, res) => {
  res.cookie('jwt', 'loggedOut', {
    expires: new Date(Date.now() + 10 * 1000),
    httpOnly: true,
  });
  res.status(200).json({ status: 'success' });
};

/**
 *  Restrict To
 **/

exports.restrictTo =
  (...roles) =>
  (req, res, next) => {
    // roles is an array like ['admin', 'lead-guide']
    // req.user is available through protect middleware
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError(
          'You do not have permission to perform this action',
          403
        )
      );
    }
    next();
  };

/**
 * ? Forget password
 **/

exports.forgotPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on posted email
  const user = await User.findOne({ email: req.body.email });

  if (!user)
    return next(
      new AppError('There is no user with this email address', 404)
    );
  // 2) Generate the random Token
  const resetToken = user.createPasswordResetToken();
  // Below line is for save the resetPasswordToken to database so validation not required.
  await user.save({ validateBeforeSave: false });

  try {
    // 3) Send it user's email
    const resetURL = `${req.protocol}://${req.get(
      'host'
    )}/api/v1/users/resetPassword/${resetToken}`;
    await new Email(user, resetURL).sendPasswordReset();

    res.status(200).json({
      status: 'success',
      message: 'Token send to email!',
    });
  } catch (err) {
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    return next(
      new AppError(
        'There was an error sending the email. Try again later',
        500
      )
    );
  }
});

/**
 *  ? Reset Password
 **/

exports.resetPassword = catchAsync(async (req, res, next) => {
  // 1) Get user based on Token
  const hashedToken = crypto
    .createHash('sha256')
    .update(req.params.token)
    .digest('hex');

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  // 2) If token not expired and there is user then set new password

  if (!user)
    return next(
      new AppError('Token is invalid or has expired!', 400)
    );

  user.password = req.body.password;
  user.passwordConform = req.body.passwordConform;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;

  await user.save();

  // 4) Log the user in,sent JWT
  createSendToken(user, 200, res);
});

/**
 * ?  Update password
 **/

exports.updatePassword = catchAsync(async (req, res, next) => {
  const { oldPassword, newPassword, newPasswordConform } = req.body;
  // 1) get user from collection
  const user = await User.findById(req.user.id).select('+password');

  if (
    !user ||
    !(await user.correctPassword(oldPassword, user.password))
  ) {
    return next(
      new AppError('Old and password does not match!', 401)
    );
  }

  // 3) If so update the password
  user.password = newPassword;
  user.passwordConform = newPasswordConform;

  await user.save();

  // 4) Log in user with new password and send JWT
  createSendToken(user, 200, res);
});
