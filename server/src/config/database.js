const mongoose = require('mongoose');
const env = require('./env');

// Connection lifecycle event handlers
mongoose.connection.on('connected', () => {
  console.log('MongoDB connected successfully');
});

mongoose.connection.on('error', (err) => {
  console.error(`MongoDB connection error: ${err.message}`);
});

mongoose.connection.on('disconnected', () => {
  console.warn('MongoDB disconnected');
});

/**
 * Connects to MongoDB using Mongoose.
 * Reads MONGODB_URI from environment configuration and establishes connection.
 * @returns {Promise<typeof mongoose>}
 */
async function connectDatabase() {
  const uri = env.MONGODB_URI;

  if (!uri || !uri.trim()) {
    throw new Error(
      'MONGODB_URI is not defined in environment variables. Please configure a valid MongoDB connection string.'
    );
  }

  try {
    const connection = await mongoose.connect(uri);
    return connection;
  } catch (error) {
    throw error;
  }
}

module.exports = {
  connectDatabase,
};
