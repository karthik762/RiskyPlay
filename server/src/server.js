const env = require('./config/env');
const app = require('./app');

const PORT = env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`Server running in ${env.NODE_ENV} mode on http://localhost:${PORT}`);
});

server.on('error', (error) => {
  console.error(`Failed to start server on port ${PORT}: ${error.message}`);
  process.exit(1);
});

module.exports = server;
