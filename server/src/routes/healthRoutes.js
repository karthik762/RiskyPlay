const express = require('express');

const router = express.Router();

router.get('/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'RiskyPlay API',
    version: 'v1',
  });
});

module.exports = router;
