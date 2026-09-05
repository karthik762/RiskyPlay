const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const healthRoutes = require('./routes/healthRoutes');
const authRoutes = require('./routes/authRoutes');
const transactionRoutes = require('./routes/transactionRoutes');
const chargebackRoutes = require('./routes/chargebackRoutes');
const dashboardRoutes = require('./routes/dashboardRoutes');
const traceRoutes = require('./routes/traceRoutes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

const app = express();

// Enable Cross-Origin Resource Sharing
app.use(cors({
  origin: env.CORS_ORIGIN,
  credentials: true,
}));

// Parse JSON request bodies
app.use(express.json());

// Mount API routes under /api/v1
app.use('/api/v1', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/transactions', transactionRoutes);
app.use('/api/v1/chargebacks', chargebackRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);
app.use('/api/v1/traces', traceRoutes);


// Catch-all 404 handler for unmatched routes
app.use(notFoundHandler);

// Centralized error handling middleware
app.use(errorHandler);

module.exports = app;
