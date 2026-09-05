const dotenv = require('dotenv');

// Load environment variables from .env if present
dotenv.config();

const env = {
  PORT: parseInt(process.env.PORT, 10) || 5000,
  NODE_ENV: process.env.NODE_ENV || 'development',
  MONGODB_URI: process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/riskyplay',
  AI_SERVICE_URL: process.env.AI_SERVICE_URL || 'http://localhost:8000',
  JWT_SECRET: process.env.JWT_SECRET || 'riskyplay-super-secret-jwt-key-2026-development',
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '24h',
  CORS_ORIGIN: process.env.CORS_ORIGIN || 'http://localhost:5173',
};

module.exports = env;
