/* eslint-disable */

import axios from 'axios';

import { showAlert } from './alerts';

const stripe = Stripe(
  'pk_test_51J3eJdSJ2bOiWHFCVoxSqrpIcYUW1EINXZAtKyEWvC3PYLCf01etXrMYoZqgCfuLHg0TmZkY8zPqTlMXKCgzlHnt00bTMX3nGL'
);

export const bookTour = async (tourId) => {
  try {
    // 1) Get Session from API
    const session = await axios(
      `/api/v1/bookings/checkout-session/${tourId}`
    );
    // console.log(session);

    // 2) Create checkout form + charge from credit cart
    await stripe.redirectToCheckout({
      sessionId: session.data.session.id,
    });
  } catch (err) {
    // console.log(err);
    showAlert('error', err);
  }
};
