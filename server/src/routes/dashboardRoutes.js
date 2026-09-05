/**
 * Express router for merchant dashboard analytics.
 * Mounted at /api/v1/dashboard
 */

'use strict';

const express = require('express');
const authenticate = require('../middleware/authenticate');
const dashboardController = require('../controllers/dashboardController');

const router = express.Router();

router.use(authenticate);

// GET /api/v1/dashboard/stats
router.get('/stats', dashboardController.getDashboardStats);

module.exports = router;
