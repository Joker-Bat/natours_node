const express = require('express');

const reviewController = require('../controllers/reviewController');
const authController = require('../controllers/authController');

// Destructure
const {
  getAllReviews,
  createReview,
  deleteReview,
  updateReview,
  setUserTourIds,
  getReview,
} = reviewController;
const { protect, restrictTo } = authController;

// Merge Params is used to get access to parent (tourId) route params
const router = express.Router({ mergeParams: true });

router.use(protect);

router
  .route('/')
  .get(getAllReviews)
  .post(restrictTo('user'), setUserTourIds, createReview);

router
  .route('/:id')
  .get(getReview)
  .delete(restrictTo('user', 'admin'), deleteReview)
  .patch(restrictTo('user', 'admin'), updateReview);

module.exports = router;
