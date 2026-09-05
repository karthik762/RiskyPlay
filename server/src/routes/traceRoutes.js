/**
 * Express router for Agent Traces inspection.
 * Mounted at /api/v1/traces
 */

'use strict';

const express = require('express');
const authenticate = require('../middleware/authenticate');
const traceController = require('../controllers/traceController');

const router = express.Router();

router.use(authenticate);

// GET /api/v1/traces - List traces with filtering
router.get('/', traceController.getTraces);

// GET /api/v1/traces/entity/:entityId - Traces for specific transaction/chargeback
router.get('/entity/:entityId', traceController.getEntityTraces);

module.exports = router;
