const express = require('express');
const cors = require('cors');
const env = require('./config/env');
const healthRoutes = require('./routes/healthRoutes');
const testRoutes = require('./routes/testRoutes');
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

// Internal development / test-only routes (excluded in production)
if (env.NODE_ENV !== 'production') {
  app.use('/api/v1/test', testRoutes);
}

// Catch-all 404 handler for unmatched routes
app.use(notFoundHandler);

// Centralized error handling middleware
app.use(errorHandler);

module.exports = app;
