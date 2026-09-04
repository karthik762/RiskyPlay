const env = require('./config/env');
const app = require('./app');
const { connectDatabase } = require('./config/database');

const PORT = env.PORT || 5000;

async function startServer() {
  try {
    // 1. Connect to MongoDB
    await connectDatabase();

    // 2. Start HTTP server only after database connection succeeds
    const server = app.listen(PORT, () => {
      console.log(`Server running in ${env.NODE_ENV} mode on http://localhost:${PORT}`);
    });

    server.on('error', (error) => {
      console.error(`Failed to start server on port ${PORT}: ${error.message}`);
      process.exit(1);
    });

    return server;
  } catch (error) {
    console.error(`Database connection failed. Server startup aborted: ${error.message}`);
    process.exit(1);
  }
}

startServer();

module.exports = { app, startServer };
