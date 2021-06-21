const express = require('express');
const viewsController = require('../controllers/viewsController');
const authController = require('../controllers/authController');
const bookingController = require('../controllers/bookingController');

// Destructure
const { isLoggedIn, protect } = authController;

const { createBookingCheckout } = bookingController;

const router = express.Router();

// Destructure
const {
  getOverview,
  getTour,
  login,
  getAccount,
  updateUserData,
  getMyTours,
} = viewsController;

router.get('/', createBookingCheckout, isLoggedIn, getOverview);
router.get('/tour/:tourSlug', isLoggedIn, getTour);
router.get('/login', isLoggedIn, login);
router.get('/me', protect, getAccount);
router.get('/my-tours', protect, getMyTours);

router.post('/submit-user-data', protect, updateUserData);

module.exports = router;
