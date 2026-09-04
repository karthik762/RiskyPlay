const express = require('express');
const validate = require('../middleware/validate');
const authenticate = require('../middleware/authenticate');
const authController = require('../controllers/authController');
const { signupSchema, loginSchema } = require('../validators/authValidators');

const router = express.Router();

// POST /api/v1/auth - Merchant registration
router.post(
  '/',
  validate(signupSchema),
  authController.signup
);

// POST /api/v1/auth/signup - Merchant registration alias
router.post(
  '/signup',
  validate(signupSchema),
  authController.signup
);

// POST /api/v1/auth/login - Merchant login
router.post(
  '/login',
  validate(loginSchema),
  authController.login
);

// GET /api/v1/auth/me - Current authenticated merchant
router.get(
  '/me',
  authenticate,
  authController.getMe
);

module.exports = router;
