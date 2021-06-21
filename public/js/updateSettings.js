/* eslint-disable */

import axios from 'axios';
import { showAlert } from './alerts';

// * type is either 'password' or 'data'
export const updateSettings = async (data, type) => {
  try {
    const res = await axios({
      method: 'PATCH',
      url: `http://localhost:8000/api/v1/users/${
        type === 'data' ? 'updateMe' : 'updatePassword'
      }`,
      data,
    });

    if (res.data.status === 'success') {
      showAlert(
        'success',
        `${type.toUpperCase()} Successfully updated`
      );
    }
  } catch (err) {
    showAlert('error', err.response.data.message);
  }
};
